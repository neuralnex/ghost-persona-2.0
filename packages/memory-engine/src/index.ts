import path from 'path';
import fs from 'fs/promises';
import { EventEmitter } from 'events';
import {
  GhostConfig,
  FileChangeBatch,
  ProjectSnapshot,
  ContextBrief,
  GHOST_DIR,
  CONFIG_FILE,
  DEFAULT_CONFIG,
  ok,
  err,
  Result,
  ArchitecturalDecision,
  MemoryFileName,
} from '@ghost-persona/shared';
import { FileWatcher } from '@ghost-persona/file-watcher';
import { createSummarizer, Summarizer, ProcessedContext } from '@ghost-persona/context-processor';
import { MarkdownGenerator } from '@ghost-persona/markdown-generator';
import { EncryptionService } from '@ghost-persona/encryption';
import { MetadataStore } from './db.js';
import { TechStackDetector, detectTechStack, DetectionResult, TechStack } from '@ghost-persona/tech-stack-detector';
import { GitHistoryAnalyzer, extractGitDecisions, CommitAnalysis } from '@ghost-persona/git-history';
import { NLQueryProcessor } from '@ghost-persona/natural-language-queries';
import { SemanticSearchResult } from '@ghost-persona/semantic-search';
import { randomUUID } from 'crypto';

export interface MemoryEngineEvents {
  'initialized': () => void;
  'batch-processed': (context: ProcessedContext) => void;
  'snapshot-created': (snapshot: ProjectSnapshot) => void;
  'error': (error: Error) => void;
}

export class MemoryEngine extends EventEmitter {
  private config: GhostConfig;
  private store: MetadataStore | null = null;
  private watcher: FileWatcher | null = null;
  private summarizer: Summarizer;
  private generator: MarkdownGenerator;
  private encryption: EncryptionService;
  private techStackDetector: TechStackDetector;
  private gitHistoryAnalyzer: GitHistoryAnalyzer;
  private nlQueryProcessor: NLQueryProcessor;
  private techStack: DetectionResult | null = null;
  private gitDecisions: ArchitecturalDecision[] = [];
  private initialized = false;
  private recentContexts: ProcessedContext[] = [];

  constructor(config: GhostConfig) {
    super();
    this.config = config;
    
    // Support environment variables for API key (GHOST_LLM_API_KEY or GEMINI_API_KEY)
    const apiKey = process.env.GHOST_LLM_API_KEY 
      || process.env.GEMINI_API_KEY 
      || config.llmApiKey;
    const model = process.env.GEMINI_MODEL || config.llmModel || 'gemini-2.5-flash';
    
    this.summarizer = createSummarizer(
      config.summarization,
      apiKey,
      model
    );
    this.generator = new MarkdownGenerator(config);
    this.encryption = new EncryptionService(config.projectRoot);
    this.techStackDetector = new TechStackDetector(config.projectRoot);
    this.gitHistoryAnalyzer = new GitHistoryAnalyzer(config.projectRoot);
    this.nlQueryProcessor = new NLQueryProcessor({
      ghostDir: config.ghostDir,
      enabled: config.vectorSearchEnabled,
      qdrantUrl: config.qdrantUrl,
      embeddingApiKey: config.embeddingApiKey,
      embeddingModel: config.embeddingModel,
    });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async initialize(): Promise<Result<void>> {
    try {
      const ghostDir = path.join(this.config.projectRoot, GHOST_DIR);

      await this.generator.initialize();

      const dbPath = path.join(ghostDir, 'metadata.json');
      this.store = new MetadataStore(dbPath);
      await this.store.load();

      this.store.upsertMetadata({
        initialized: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
        version: '0.3.0',
        projectRoot: this.config.projectRoot,
      });

      // Auto-detect tech stack
      try {
        this.techStack = await this.techStackDetector.detect();
        await this.updateArchitectureWithTechStack();
      } catch {
        // Tech stack detection failed - continue without it
        this.techStack = null;
      }

      // Extract decisions from git history
      try {
        if (await this.gitHistoryAnalyzer.isGitRepo()) {
          this.gitDecisions = await this.gitHistoryAnalyzer.extractDecisions(50);
          await this.updateDecisionsFromGitHistory();
        }
      } catch {
        // Git history extraction failed - continue without it
        this.gitDecisions = [];
      }

      // Initialize NL query processor (v0.3)
      try {
        await this.nlQueryProcessor.initialize();
      } catch {
        // NL query processor failed - continue without it
        console.warn('Natural language query processor failed to initialize');
      }

      this.initialized = true;
      this.emit('initialized');
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async start(): Promise<Result<void>> {
    if (!this.initialized) {
      const result = await this.initialize();
      if (!result.success) return result;
    }

    try {
      this.watcher = new FileWatcher(this.config);

      this.watcher.on('batch', async (batch: FileChangeBatch) => {
        await this.processBatch(batch);
      });

      this.watcher.on('error', (error: Error) => {
        this.emit('error', error);
      });

      this.watcher.start();
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.stop();
      this.watcher = null;
    }
    if (this.store) {
      await this.store.flush();
      this.store.close();
      this.store = null;
    }
  }

  // ─── Batch Processing ──────────────────────────────────────────────────────

  private async processBatch(batch: FileChangeBatch): Promise<void> {
    try {
      const context = await this.summarizer.summarize(batch);
      batch.summary = context.summary;

      await Promise.all([
        this.generator.appendFileHistory(context),
        this.generator.appendDecision(context),
        this.generator.updateCurrentWork(context),
        this.generator.updateArchitecture(context),
      ]);

      this.store?.recordBatch(batch, context);
      this.store?.incrementMetric('totalFileChanges', batch.events.length);

      this.recentContexts.unshift(context);
      if (this.recentContexts.length > 50) this.recentContexts.pop();

      this.emit('batch-processed', context);
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Snapshots ─────────────────────────────────────────────────────────────

  async createSnapshot(options?: {
    commit?: string;
    branch?: string;
    currentGoal?: string;
    knownIssues?: string[];
    nextTasks?: string[];
  }): Promise<Result<ProjectSnapshot>> {
    try {
      const memorySnapshot = await this.generator.readAllMemory();
      const recentChanges = this.recentContexts
        .slice(0, 10)
        .map((c) => `${c.timestamp.toISOString().split('T')[0]}: ${c.title}`);

      const snapshot: ProjectSnapshot = {
        id: randomUUID(),
        date: new Date(),
        commit: options?.commit,
        branch: options?.branch,
        recentChanges,
        currentGoal: options?.currentGoal ?? 'Active development',
        knownIssues: options?.knownIssues ?? [],
        nextTasks: options?.nextTasks ?? [],
        memorySnapshot: memorySnapshot as Record<MemoryFileName, string>,
      };

      await this.generator.createSnapshot(snapshot);
      this.store?.recordSnapshot(snapshot);
      this.store?.incrementMetric('totalSnapshots');

      this.emit('snapshot-created', snapshot);
      return ok(snapshot);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Context Retrieval ─────────────────────────────────────────────────────

  async search(query: string): Promise<string[]> {
    const results: string[] = [];
    const lowerQuery = query.toLowerCase();
    const memory = await this.generator.readAllMemory();

    for (const [fileName, content] of Object.entries(memory)) {
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          const ctx = lines.slice(Math.max(0, i - 1), i + 3).join('\n').trim();
          if (ctx) results.push(`[${fileName}] ${ctx}`);
        }
      }
    }

    return results.slice(0, 10);
  }

  // ─── Semantic Search (v0.3) ───────────────────────────────────────────────

  /**
   * Perform a semantic search using vector embeddings
   */
  async semanticSearch(
    query: string,
    options?: { limit?: number; minScore?: number; type?: string }
  ): Promise<Result<SemanticSearchResult>> {
    return this.nlQueryProcessor.search(query, options);
  }

  /**
   * Process a natural language query like "What changed last week?"
   */
  async queryNaturalLanguage(
    query: string,
    options?: { limit?: number }
  ): Promise<Result<{ parsed: any; searchResult?: SemanticSearchResult }>> {
    return this.nlQueryProcessor.process(query);
  }

  /**
   * Convenience method: What changed last week?
   */
  async whatChangedLastWeek(): Promise<Result<SemanticSearchResult>> {
    return this.nlQueryProcessor.whatChangedLastWeek();
  }

  /**
   * Convenience method: What changed yesterday?
   */
  async whatChangedYesterday(): Promise<Result<SemanticSearchResult>> {
    return this.nlQueryProcessor.whatChangedYesterday();
  }

  /**
   * Convenience method: What changed today?
   */
  async whatChangedToday(): Promise<Result<SemanticSearchResult>> {
    return this.nlQueryProcessor.whatChangedToday();
  }

  /**
   * Convenience method: What changed this month?
   */
  async whatChangedThisMonth(): Promise<Result<SemanticSearchResult>> {
    return this.nlQueryProcessor.whatChangedThisMonth();
  }

  /**
   * Find similar decisions
   */
  async findSimilarDecisions(query: string): Promise<Result<SemanticSearchResult>> {
    return this.nlQueryProcessor.findDecisions(query);
  }

  async generateBrief(): Promise<string> {
    return this.generator.generateBrief();
  }

  async getContextBrief(): Promise<ContextBrief> {
    return this.generator.generateContextBrief();
  }

  // ─── Encryption ────────────────────────────────────────────────────────────

  async encrypt(password: string): Promise<Result<string>> {
    try {
      const vaultPath = await this.encryption.encrypt(password);
      return ok(vaultPath);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async decrypt(password: string): Promise<Result<void>> {
    try {
      await this.encryption.decrypt(password);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Tech Stack Detection ─────────────────────────────────────────────────

  async detectTechStack(): Promise<Result<DetectionResult>> {
    try {
      this.techStack = await this.techStackDetector.detect();
      await this.updateArchitectureWithTechStack();
      return ok(this.techStack);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getTechStack(): Promise<DetectionResult | null> {
    if (!this.techStack) {
      try {
        this.techStack = await this.techStackDetector.detect();
        await this.updateArchitectureWithTechStack();
      } catch {
        return null;
      }
    }
    return this.techStack;
  }

  /**
   * Update architecture.md with detected tech stack
   */
  private async updateArchitectureWithTechStack(): Promise<void> {
    if (!this.techStack) return;

    try {
      const techStack = this.techStack.techStack;
      let content = await this.generator.readFile('architecture.md');

      // Update Tech Stack section
      const techStackSection = this.formatTechStackSection(techStack);
      
      // Replace or insert Tech Stack section
      const techStackRegex = /## Tech Stack[\s\S]*?(?=\n##|\n---|$)/;
      const match = content.match(techStackRegex);
      
      if (match) {
        content = content.replace(match[0], techStackSection);
      } else {
        // Insert after ## Overview
        const overviewRegex = /## Overview[\s\S]*?(?=\n##|\n---|$)/;
        const overviewMatch = content.match(overviewRegex);
        if (overviewMatch) {
          content = content.replace(
            overviewMatch[0],
            overviewMatch[0] + '\n\n' + techStackSection
          );
        } else {
          content += '\n\n' + techStackSection;
        }
      }

      // Update timestamp
      content = this.generator['updateTimestamp'](content);

      const filePath = path.join(this.config.ghostDir, 'architecture.md');
      await fs.writeFile(filePath, content, 'utf-8');
    } catch {
      // Ignore errors - architecture file might not exist yet
    }
  }

  private formatTechStackSection(techStack: TechStack): string {
    const lines: string[] = [];
    
    lines.push('## Tech Stack\n');
    
    if (techStack.languages.length > 0) {
      lines.push('### Languages');
      lines.push('');
      lines.push(techStack.languages.map((l: string) => `- ${l}`).join('\n'));
      lines.push('');
    }
    
    if (techStack.frameworks.length > 0) {
      lines.push('### Frameworks');
      lines.push('');
      lines.push(techStack.frameworks.map((f: string) => `- ${f}`).join('\n'));
      lines.push('');
    }
    
    if (techStack.databases.length > 0) {
      lines.push('### Databases');
      lines.push('');
      lines.push(techStack.databases.map((d: string) => `- ${d}`).join('\n'));
      lines.push('');
    }
    
    if (techStack.tools.length > 0) {
      lines.push('### Key Tools');
      lines.push('');
      lines.push(techStack.tools.slice(0, 10).map((t: string) => `- ${t}`).join('\n'));
      lines.push('');
    }
    
    if (techStack.testing.length > 0) {
      lines.push('### Testing');
      lines.push('');
      lines.push(techStack.testing.map((t: string) => `- ${t}`).join('\n'));
      lines.push('');
    }
    
    return lines.join('\n');
  }

  // ─── Git History Integration ───────────────────────────────────────────────

  async extractGitDecisions(limit = 50): Promise<Result<ArchitecturalDecision[]>> {
    try {
      if (!(await this.gitHistoryAnalyzer.isGitRepo())) {
        return ok([]);
      }
      
      this.gitDecisions = await this.gitHistoryAnalyzer.extractDecisions(limit);
      await this.updateDecisionsFromGitHistory();
      
      return ok(this.gitDecisions);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getGitDecisions(): Promise<ArchitecturalDecision[]> {
    if (this.gitDecisions.length === 0) {
      try {
        await this.extractGitDecisions();
      } catch {
        return [];
      }
    }
    return this.gitDecisions;
  }

  /**
   * Update decisions.md with decisions extracted from git history
   */
  private async updateDecisionsFromGitHistory(): Promise<void> {
    if (this.gitDecisions.length === 0) return;

    try {
      let content = await this.generator.readFile('decisions.md');

      // Format git decisions
      const gitDecisionsSection = this.formatGitDecisionsSection();
      
      // Find the Decision Log section
      const logRegex = /## Decision Log[\s\S]*?(?=\n##|\n---|$)/;
      const match = content.match(logRegex);
      
      if (match) {
        // Append git decisions to the Decision Log
        const newContent = match[0] + '\n' + gitDecisionsSection;
        content = content.replace(match[0], newContent);
      } else {
        // Insert after ## Decision Log header if it exists
        const headerRegex = /## Decision Log/;
        const headerMatch = content.match(headerRegex);
        if (headerMatch) {
          const insertAt = headerMatch.index! + headerMatch[0].length;
          content = content.slice(0, insertAt) + '\n\n' + gitDecisionsSection + '\n' + content.slice(insertAt);
        } else {
          // Insert before --- or at the end
          const separatorRegex = /^---/m;
          const separatorMatch = content.match(separatorRegex);
          if (separatorMatch) {
            const insertAt = separatorMatch.index!;
            content = content.slice(0, insertAt) + '\n' + gitDecisionsSection + '\n\n' + content.slice(insertAt);
          } else {
            content += '\n\n' + gitDecisionsSection + '\n';
          }
        }
      }

      // Update timestamp
      content = this.generator['updateTimestamp'](content);

      const filePath = path.join(this.config.ghostDir, 'decisions.md');
      await fs.writeFile(filePath, content, 'utf-8');
    } catch {
      // Ignore errors - decisions file might not exist yet
    }
  }

  private formatGitDecisionsSection(): string {
    if (this.gitDecisions.length === 0) return '';

    const lines: string[] = [];
    
    // Sort by date (oldest first for ADR-style)
    const sortedDecisions = [...this.gitDecisions].sort((a, b) => a.date.getTime() - b.date.getTime());
    
    for (const decision of sortedDecisions.slice(0, 20)) {
      lines.push('');
      lines.push(`### ${decision.title}`);
      lines.push('');
      lines.push(`**Date:** ${decision.date.toISOString().split('T')[0]}`);
      lines.push(`**Status:** ${decision.status}`);
      
      if (decision.context) {
        lines.push(`**Context:** ${decision.context}`);
      }
      
      if (decision.decision) {
        lines.push(`**Decision:** ${decision.decision}`);
      }
      
      if (decision.rationale) {
        lines.push(`**Rationale:** ${decision.rationale}`);
      }
      
      lines.push('---');
    }
    
    return lines.join('\n');
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  getStatus() {
    return {
      initialized: this.initialized,
      watching: this.watcher?.isRunning() ?? false,
      config: this.config,
      recentContextCount: this.recentContexts.length,
      techStack: this.techStack?.techStack,
      hasGitDecisions: this.gitDecisions.length > 0,
      gitDecisionsCount: this.gitDecisions.length,
    };
  }

  // ─── Static Factory ────────────────────────────────────────────────────────

  static async fromDirectory(projectRoot: string): Promise<MemoryEngine> {
    const configPath = path.join(projectRoot, GHOST_DIR, CONFIG_FILE);
    let config: GhostConfig;

    try {
      const raw = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(raw) as GhostConfig;
    } catch {
      config = {
        ...DEFAULT_CONFIG,
        projectName: path.basename(projectRoot),
        projectRoot,
        ghostDir: path.join(projectRoot, GHOST_DIR),
      };
    }

    return new MemoryEngine(config);
  }
}

export { GhostConfig, ProcessedContext };
