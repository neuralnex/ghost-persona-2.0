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
} from '@ghost-persona/shared';
import { FileWatcher } from '@ghost-persona/file-watcher';
import { createSummarizer, Summarizer, ProcessedContext } from '@ghost-persona/context-processor';
import { MarkdownGenerator } from '@ghost-persona/markdown-generator';
import { EncryptionService } from '@ghost-persona/encryption';
import { MetadataStore } from './db.js';
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
  private initialized = false;
  private recentContexts: ProcessedContext[] = [];

  constructor(config: GhostConfig) {
    super();
    this.config = config;
    this.summarizer = createSummarizer(
      config.summarization,
      config.llmApiKey,
      config.llmModel
    );
    this.generator = new MarkdownGenerator(config);
    this.encryption = new EncryptionService(config.projectRoot);
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
        version: '0.1.0',
        projectRoot: this.config.projectRoot,
      });

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
        memorySnapshot: memorySnapshot as Record<import('@ghost-persona/shared').MemoryFileName, string>,
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

  // ─── Status ────────────────────────────────────────────────────────────────

  getStatus() {
    return {
      initialized: this.initialized,
      watching: this.watcher?.isRunning() ?? false,
      config: this.config,
      recentContextCount: this.recentContexts.length,
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
