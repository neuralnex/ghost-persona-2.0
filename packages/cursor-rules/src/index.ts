/**
 * Cursor Rules Generator
 * 
 * Auto-generates .cursorrules and CLAUDE.md files from Ghost Persona memory.
 * These files provide AI coding agents with project-specific instructions and context.
 * 
 * Cursor Rules: https://www.cursor.com/docs/guides/settings#cursor-rules
 * CLAUDE.md: https://github.com/claude-code/claude-code/blob/main/docs/CLAUDE.md
 */

import path from 'path';
import fs from 'fs/promises';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { ok, err, Result, GHOST_DIR } from '@ghost-persona/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

interface GenerationResult {
  cursorRulesPath?: string;
  claudeMDPath?: string;
}

export interface CursorRules {
  /** Version of the cursorrules spec */
  cursorRulesVersion: number;
  /** Rules for how Cursor should handle the codebase */
  rules: Array<{
    /** Rule name or description */
    name?: string;
    /** glob pattern for files this rule applies to */
    pattern: string;
    /** Whether to include these files in context */
    includeInContext?: boolean;
    /** Whether to index these files for search */
    index?: boolean;
    /** Custom instructions for this pattern */
    instructions?: string;
  }>;
  /** Global instructions for the project */
  instructions?: string;
}

export interface ClaudeMD {
  /** Project name */
  project?: string;
  /** Project description */
  description?: string;
  /** Architecture overview */
  architecture?: string;
  /** Key files and directories */
  keyFiles?: string[];
  /** Coding standards */
  standards?: string;
  /** Important decisions */
  decisions?: string[];
  /** Current work */
  currentWork?: string[];
}

export interface GenerationOptions {
  /** Output directory (default: project root) */
  outputDir?: string;
  /** Whether to generate .cursorrules */
  generateCursorRules?: boolean;
  /** Whether to generate CLAUDE.md */
  generateClaudeMD?: boolean;
  /** Additional custom rules */
  customRules?: Array<{
    name?: string;
    pattern: string;
    includeInContext?: boolean;
    index?: boolean;
    instructions?: string;
  }>;
  /** Additional custom instructions */
  customInstructions?: string;
}

// ─── Cursor Rules Generator ────────────────────────────────────────────────

export class CursorRulesGenerator {
  private projectRoot: string;
  private engine: MemoryEngine | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * Initialize the generator with memory engine
   */
  async initialize(): Promise<Result<void>> {
    try {
      this.engine = await MemoryEngine.fromDirectory(this.projectRoot);
      const initResult = await this.engine.initialize();
      
      if (!initResult.success) {
        return err(initResult.error);
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate both .cursorrules and CLAUDE.md files
   */
  async generateAll(options?: GenerationOptions): Promise<Result<GenerationResult>> {
    const results: { cursorRulesPath?: string; claudeMDPath?: string } = {};

    if (options?.generateCursorRules !== false) {
      const cursorRulesResult = await this.generateCursorRules(options);
      if (cursorRulesResult.success) {
        results.cursorRulesPath = cursorRulesResult.data;
      }
    }

    if (options?.generateClaudeMD !== false) {
      const claudeMDResult = await this.generateClaudeMD(options);
      if (claudeMDResult.success) {
        results.claudeMDPath = claudeMDResult.data;
      }
    }

    return ok(results);
  }

  /**
   * Generate .cursorrules file
   */
  async generateCursorRules(options?: GenerationOptions): Promise<Result<string>> {
    if (!this.engine) {
      const initResult = await this.initialize();
      if (!initResult.success) return initResult as Result<string>;
    }

    try {
      // Read memory files
      const memory = await this.engine!['generator'].readAllMemory();
      const techStack = await this.engine!.getTechStack();
      const ghostDir = path.join(this.projectRoot, GHOST_DIR);
      
      // Build cursorrules object
      const cursorRules: CursorRules = {
        cursorRulesVersion: 1,
        rules: this.buildRulesFromMemory(memory, techStack),
        instructions: this.buildInstructionsFromMemory(memory, techStack, options?.customInstructions),
      };

      // Add custom rules if provided
      if (options?.customRules) {
        cursorRules.rules.push(...options.customRules);
      }

      // Write to file
      const outputDir = options?.outputDir || this.projectRoot;
      const outputPath = path.join(outputDir, '.cursorrules');
      
      await fs.writeFile(outputPath, JSON.stringify(cursorRules, null, 2), 'utf-8');

      return ok(outputPath);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate CLAUDE.md file
   */
  async generateClaudeMD(options?: GenerationOptions): Promise<Result<string>> {
    if (!this.engine) {
      const initResult = await this.initialize();
      if (!initResult.success) return initResult as Result<string>;
    }

    try {
      // Read memory files
      const memory = await this.engine!['generator'].readAllMemory();
      const techStack = await this.engine!.getTechStack();
      const brief = await this.engine!.generateBrief();

      // Build CLAUDE.md content
      const claudeMD: ClaudeMD = {
        project: memory['project.md']?.split('\n')[0].replace('# ', '') || 'Project',
        description: this.extractDescription(memory['project.md']),
        architecture: this.extractArchitecture(memory['architecture.md']),
        keyFiles: this.extractKeyFiles(memory),
        standards: memory['developer-persona.md'],
        decisions: this.extractDecisions(memory['decisions.md']),
        currentWork: this.extractCurrentWork(memory['current-work.md']),
      };

      // Generate markdown
      const markdown = this.claudeMDToMarkdown(claudeMD, brief);

      // Write to file
      const outputDir = options?.outputDir || this.projectRoot;
      const outputPath = path.join(outputDir, 'CLAUDE.md');
      
      await fs.writeFile(outputPath, markdown, 'utf-8');

      return ok(outputPath);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Build rules from memory
   */
  private buildRulesFromMemory(memory: Record<string, string>, techStack: any): CursorRules['rules'] {
    const rules: CursorRules['rules'] = [];

    // Always include source files
    rules.push({
      name: 'Include source files',
      pattern: '**/*.{js,jsx,ts,tsx,py,go,rs,java,php,rb,swift,kt}',
      includeInContext: true,
      index: true,
    });

    // Include test files
    rules.push({
      name: 'Include test files',
      pattern: '**/*.{test,spec}.{js,ts,py,go,rs}',
      includeInContext: true,
      index: true,
    });

    // Include configuration files
    rules.push({
      name: 'Include configuration files',
      pattern: '**/{package,tsconfig,vitest,jest,pyproject,setup,requirements,composer,go.mod,Makefile}.{json,js,ts,toml,yml,yaml,txt}',
      includeInContext: true,
      index: true,
    });

    // Include markdown documentation
    rules.push({
      name: 'Include documentation',
      pattern: '**/*.md',
      includeInContext: true,
      index: true,
    });

    // Exclude node_modules
    rules.push({
      name: 'Exclude node_modules',
      pattern: 'node_modules/**',
      includeInContext: false,
      index: false,
    });

    // Exclude build artifacts
    rules.push({
      name: 'Exclude build artifacts',
      pattern: '{dist,build,out,target,bin}/**',
      includeInContext: false,
      index: false,
    });

    // Add framework-specific rules based on tech stack
    if (techStack) {
      const frameworks = techStack.techStack?.frameworks || [];
      
      if (frameworks.includes('Next.js')) {
        rules.push({
          name: 'Next.js pages and API routes',
          pattern: '{pages,app}/**/*.{js,ts,jsx,tsx}',
          includeInContext: true,
          index: true,
          instructions: 'Next.js pages and API routes - primary application logic',
        });
      }

      if (frameworks.includes('Express') || frameworks.includes('Fastify')) {
        rules.push({
          name: 'Backend routes',
          pattern: '{routes,controllers,handlers}/**/*.{js,ts}',
          includeInContext: true,
          index: true,
          instructions: 'Backend API routes and controllers',
        });
      }
    }

    return rules;
  }

  /**
   * Build global instructions from memory
   */
  private buildInstructionsFromMemory(memory: Record<string, string>, techStack: any, customInstructions?: string): string {
    const parts: string[] = [];

    // Add project description
    if (memory['project.md']) {
      const description = this.extractDescription(memory['project.md']);
      if (description) {
        parts.push(`Project Description:\n${description}`);
      }
    }

    // Add tech stack
    if (techStack) {
      const stack = this.formatTechStack(techStack);
      if (stack) {
        parts.push(`\nTechnology Stack:\n${stack}`);
      }
    }

    // Add architecture overview
    if (memory['architecture.md']) {
      const architecture = this.extractArchitecture(memory['architecture.md']);
      if (architecture) {
        parts.push(`\nArchitecture:\n${architecture.substring(0, 500)}...`);
      }
    }

    // Add important decisions
    if (memory['decisions.md']) {
      const decisions = this.extractDecisions(memory['decisions.md']);
      if (decisions.length > 0) {
        parts.push(`\nKey Decisions:\n${decisions.slice(0, 5).map(d => `- ${d}`).join('\n')}`);
      }
    }

    // Add custom instructions
    if (customInstructions) {
      parts.push(`\nCustom Instructions:\n${customInstructions}`);
    }

    // Add current work
    if (memory['current-work.md']) {
      const currentWork = this.extractCurrentWork(memory['current-work.md']);
      if (currentWork.length > 0) {
        parts.push(`\nCurrent Work:\n${currentWork.map(c => `- ${c}`).join('\n')}`);
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Extract description from project.md
   */
  private extractDescription(content: string): string {
    const lines = content.split('\n');
    const descriptionLines: string[] = [];
    
    let inDescription = false;
    for (const line of lines) {
      if (line.startsWith('## Description') || line.startsWith('## Overview')) {
        inDescription = true;
        continue;
      }
      if (inDescription && line.startsWith('##')) {
        break;
      }
      if (inDescription && line.trim()) {
        descriptionLines.push(line.replace(/^#\s*/, '').trim());
      }
    }

    return descriptionLines.join(' ').substring(0, 500);
  }

  /**
   * Extract architecture from architecture.md
   */
  private extractArchitecture(content: string): string {
    const lines = content.split('\n');
    const architectureLines: string[] = [];
    
    let inArchitecture = false;
    for (const line of lines) {
      if (line.startsWith('## Architecture') || line.startsWith('## Overview')) {
        inArchitecture = true;
        continue;
      }
      if (inArchitecture && line.startsWith('##')) {
        break;
      }
      if (inArchitecture && line.trim()) {
        architectureLines.push(line.trim());
      }
    }

    return architectureLines.join(' ').substring(0, 1000);
  }

  /**
   * Extract decisions from decisions.md
   */
  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ') || line.startsWith('### ')) {
        const decision = line.replace(/^#\s*/, '').trim();
        if (decision) {
          decisions.push(decision);
        }
      }
    }

    return decisions.slice(0, 10);
  }

  /**
   * Extract current work items from current-work.md
   */
  private extractCurrentWork(content: string): string[] {
    const work: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('- ') || line.startsWith('* ')) {
        work.push(line.substring(2).trim());
      }
    }

    return work.slice(0, 10);
  }

  /**
   * Extract key files from memory
   */
  private extractKeyFiles(memory: Record<string, string>): string[] {
    const keyFiles: string[] = [];
    
    // Add common important files
    const importantFiles = [
      'package.json',
      'tsconfig.json',
      'src/index.ts',
      'src/index.js',
      'src/main.ts',
      'src/app.ts',
      'README.md',
      '.env.example',
    ];

    for (const file of importantFiles) {
      // Check if file exists (we don't have filesystem access here, but we can mention common ones)
      keyFiles.push(file);
    }

    return keyFiles;
  }

  /**
   * Format tech stack for instructions
   */
  private formatTechStack(techStack: any): string {
    if (!techStack || !techStack.techStack) {
      return '';
    }

    const { languages, frameworks, databases, tools } = techStack.techStack;
    const parts: string[] = [];

    if (languages && languages.length > 0) {
      parts.push(`Languages: ${languages.join(', ')}`);
    }
    if (frameworks && frameworks.length > 0) {
      parts.push(`Frameworks: ${frameworks.join(', ')}`);
    }
    if (databases && databases.length > 0) {
      parts.push(`Databases: ${databases.join(', ')}`);
    }
    if (tools && tools.length > 0) {
      parts.push(`Tools: ${tools.slice(0, 5).join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Convert CLAUDE.md object to markdown
   */
  private claudeMDToMarkdown(claudeMD: ClaudeMD, brief: string): string {
    const lines: string[] = [];

    // Header
    lines.push('# CLAUDE.md');
    lines.push('');
    lines.push('> AI coding agent instructions for this project');
    lines.push('');
    lines.push('---');
    lines.push('');

    // Project info
    if (claudeMD.project) {
      lines.push(`## Project: ${claudeMD.project}`);
      lines.push('');
    }

    // Description
    if (claudeMD.description) {
      lines.push('## Description');
      lines.push('');
      lines.push(claudeMD.description);
      lines.push('');
    }

    // Architecture
    if (claudeMD.architecture) {
      lines.push('## Architecture');
      lines.push('');
      lines.push(claudeMD.architecture);
      lines.push('');
    }

    // Key files
    if (claudeMD.keyFiles && claudeMD.keyFiles.length > 0) {
      lines.push('## Key Files');
      lines.push('');
      lines.push(claudeMD.keyFiles.map(f => `- "` + f + '"').join('\n'));
      lines.push('');
    }

    // Decisions
    if (claudeMD.decisions && claudeMD.decisions.length > 0) {
      lines.push('## Important Decisions');
      lines.push('');
      lines.push(claudeMD.decisions.map((d, i) => `${i + 1}. ${d}`).join('\n'));
      lines.push('');
    }

    // Standards
    if (claudeMD.standards) {
      lines.push('## Coding Standards');
      lines.push('');
      lines.push(claudeMD.standards);
      lines.push('');
    }

    // Current work
    if (claudeMD.currentWork && claudeMD.currentWork.length > 0) {
      lines.push('## Current Work');
      lines.push('');
      lines.push(claudeMD.currentWork.map(c => `- ${c}`).join('\n'));
      lines.push('');
    }

    // Add brief
    lines.push('---');
    lines.push('');
    lines.push('## AI Briefing');
    lines.push('');
    lines.push(brief);

    return lines.join('\n');
  }

  /**
   * Update existing .cursorrules file with new rules
   */
  async updateCursorRules(newRules: Partial<CursorRules>, options?: GenerationOptions): Promise<Result<string>> {
    const outputDir = options?.outputDir || this.projectRoot;
    const filePath = path.join(outputDir, '.cursorrules');

    try {
      // Read existing file
      let cursorRules: CursorRules = {
        cursorRulesVersion: 1,
        rules: [],
      };

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        cursorRules = JSON.parse(content);
      } catch {
        // File doesn't exist, use empty
      }

      // Merge with new rules
      cursorRules = {
        ...cursorRules,
        ...newRules,
        rules: [...cursorRules.rules, ...(newRules.rules || [])],
      };

      // Write back
      await fs.writeFile(filePath, JSON.stringify(cursorRules, null, 2), 'utf-8');

      return ok(filePath);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Validate cursorrules file
   */
  async validateCursorRules(filePath?: string): Promise<Result<CursorRules>> {
    const pathToCheck = filePath || path.join(this.projectRoot, '.cursorrules');

    try {
      const content = await fs.readFile(pathToCheck, 'utf-8');
      const cursorRules: CursorRules = JSON.parse(content);

      // Validate structure
      if (!cursorRules.cursorRulesVersion) {
        return err(new Error('Missing cursorRulesVersion'));
      }
      if (!cursorRules.rules || !Array.isArray(cursorRules.rules)) {
        return err(new Error('Missing or invalid rules array'));
      }

      return ok(cursorRules);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────

export function createCursorRulesGenerator(projectRoot: string): CursorRulesGenerator {
  return new CursorRulesGenerator(projectRoot);
}

// ─── Exports ───────────────────────────────────────────────────────────────

