/**
 * Git History Analyzer
 * 
 * Extracts architectural decisions and context from git commit history.
 * Identifies:
 * - Architectural decisions (ADR-style from commit messages)
 * - Migration commits (framework/library changes)
 * - Refactoring patterns
 * - Feature additions and removals
 * - Bug fixes and their context
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { ArchitecturalDecision } from '@ghost-persona/shared';

const execAsync = promisify(exec);

export interface GitCommit {
  hash: string;
  hashShort: string;
  message: string;
  author: string;
  date: Date;
  files: GitFileChange[];
}

export interface GitFileChange {
  path: string;
  status: 'A' | 'M' | 'D' | 'R' | 'C';
  additions?: number;
  deletions?: number;
}

export interface CommitAnalysis {
  commit: GitCommit;
  type: CommitType;
  decision?: ArchitecturalDecision;
  summary: string;
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export type CommitType =
  | 'feature'
  | 'fix'
  | 'docs'
  | 'style'
  | 'refactor'
  | 'perf'
  | 'test'
  | 'chore'
  | 'revert'
  | 'migration'
  | 'breaking'
  | 'security'
  | 'ci'
  | 'build'
  | 'unknown';

// ─── Decision Keywords ───────────────────────────────────────────────────────

const DECISION_KEYWORDS = [
  // Migration keywords
  { patterns: ['migrate', 'migration', 'switch', 'switching', 'move', 'moving'], type: 'migration' },
  { patterns: ['from .* to', 'replace .* with', 'upgrade .* to'], type: 'migration' },
  
  // Decision keywords
  { patterns: ['decide', 'decided', 'decision', 'choose', 'chose', 'chosen'], type: 'decision' },
  { patterns: ['adr', 'architecture decision record'], type: 'decision' },
  { patterns: ['adopt', 'adopting', 'adopted'], type: 'decision' },
  { patterns: ['standardize', 'standardizing', 'standardized'], type: 'decision' },
  
  // Technology choices
  { patterns: ['use .* instead of', 'prefer .* over'], type: 'decision' },
  { patterns: ['select', 'selected', 'selecting'], type: 'decision' },
  { patterns: ['implement', 'implementing', 'implemented'], type: 'decision' },
];

// ─── Migration Patterns ─────────────────────────────────────────────────────

const MIGRATION_PATTERNS: Array<{ 
  pattern: RegExp;
  from?: string;
  to?: string;
  description: string;
}> = [
  // Authentication
  { pattern: /(jwt|jsonwebtoken).*?(clerk|auth0|supabase|next-auth|passport)/i, from: 'JWT', to: 'Clerk/Auth0/Supabase', description: 'Authentication provider migration' },
  { pattern: /(passport|express-session).*?(clerk|auth0)/i, from: 'Session-based', to: 'Token-based', description: 'Session to token auth migration' },
  
  // HTTP Frameworks
  { pattern: /(express).*?(fastify|hono|koa|nest)/i, from: 'Express', description: 'HTTP framework migration' },
  { pattern: /(restify|hapi).*?(fastify|express)/i, from: 'Legacy framework', description: 'HTTP framework migration' },
  
  // ORMs
  { pattern: /(mongoose|sequelize|bookshelf).*?(prisma|drizzle|typeorm)/i, from: 'Legacy ORM', description: 'ORM migration' },
  { pattern: /(sql|knex).*?(prisma|drizzle)/i, from: 'Raw SQL', to: 'ORM', description: 'Raw SQL to ORM migration' },
  
  // State Management
  { pattern: /(redux).*?(zustand|jotai|recoil)/i, from: 'Redux', description: 'State management migration' },
  { pattern: /(mobx).*?(zustand|jotai)/i, from: 'MobX', description: 'State management migration' },
  
  // Frontend Frameworks
  { pattern: /(angular|backbone|ember).*?(react|vue|svelte)/i, from: 'Legacy framework', description: 'Frontend framework migration' },
  { pattern: /(react).*?(vue|svelte|solid)/i, from: 'React', description: 'Frontend framework migration' },
  
  // CSS
  { pattern: /(sass|less|stylus).*?(tailwind|tailwindcss)/i, from: 'Sass/Less', to: 'Tailwind', description: 'CSS methodology migration' },
  { pattern: /(bootstrap).*?(tailwind|tailwindcss)/i, from: 'Bootstrap', to: 'Tailwind', description: 'CSS framework migration' },
  
  // Build Tools
  { pattern: /(webpack).*?(vite|esbuild|turbopack)/i, from: 'Webpack', description: 'Build tool migration' },
  { pattern: /(rollup).*?(vite|esbuild)/i, from: 'Rollup', description: 'Build tool migration' },
  
  // Test Runners
  { pattern: /(jest).*?(vitest|bun:test)/i, from: 'Jest', to: 'Vitest/Bun', description: 'Test runner migration' },
  { pattern: /(mocha|jasmine).*?(jest|vitest)/i, from: 'Mocha/Jasmine', description: 'Test runner migration' },
  
  // TypeScript
  { pattern: /(javascript|js|flow).*?(typescript|ts)/i, from: 'JavaScript', to: 'TypeScript', description: 'TypeScript adoption' },
  { pattern: /(add types|type annotations|convert to ts)/i, from: 'JavaScript', to: 'TypeScript', description: 'TypeScript adoption' },
  
  // Databases
  { pattern: /(mysql|postgres).*?(mongodb|mongo)/i, from: 'SQL', to: 'MongoDB', description: 'SQL to NoSQL migration' },
  { pattern: /(sqlite|mysql).*?(postgres|postgresql)/i, from: 'SQLite/MySQL', to: 'PostgreSQL', description: 'Database migration' },
];

// ─── Commit Type Detection ──────────────────────────────────────────────────

const COMMIT_TYPE_PATTERNS: Array<{ patterns: RegExp[]; type: CommitType }> = [
  { patterns: [/^feat(?:\s*\(.+\))?:/i, /feature:/i], type: 'feature' },
  { patterns: [/^fix(?:\s*\(.+\))?:/i, /bugfix:/i, /fix:/i], type: 'fix' },
  { patterns: [/^docs(?:\s*\(.+\))?:/i, /doc:/i, /documentation:/i], type: 'docs' },
  { patterns: [/^style(?:\s*\(.+\))?:/i, /style:/i], type: 'style' },
  { patterns: [/^refactor(?:\s*\(.+\))?:/i, /refactor:/i], type: 'refactor' },
  { patterns: [/^perf(?:\s*\(.+\))?:/i, /performance:/i], type: 'perf' },
  { patterns: [/^test(?:\s*\(.+\))?:/i, /test:/i], type: 'test' },
  { patterns: [/^chore(?:\s*\(.+\))?:/i, /chore:/i, /maintenance:/i], type: 'chore' },
  { patterns: [/^revert(?:\s*\(.+\))?:/i, /revert:/i], type: 'revert' },
  { patterns: [/^migration:/i, /migrate:/i], type: 'migration' },
  { patterns: [/^BREAKING CHANGE/i, /breaking change/i, /BREAKING:/i], type: 'breaking' },
  { patterns: [/^security:/i, /security fix/i], type: 'security' },
  { patterns: [/^ci(?:\s*\(.+\))?:/i, /continuous integration:/i], type: 'ci' },
  { patterns: [/^build(?:\s*\(.+\))?:/i, /build:/i], type: 'build' },
];

export class GitHistoryAnalyzer {
  private readonly projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // ─── Git Availability ───────────────────────────────────────────────────────

  async isGitRepo(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Fetch Commits ─────────────────────────────────────────────────────────

  async getCommits(limit = 100, since?: Date): Promise<GitCommit[]> {
    try {
      const sinceArg = since ? `--since="${since.toISOString()}"` : '';
      const { stdout } = await execAsync(
        `git log --pretty=format:"%H|%h|%an|%aI|%s" --name-status ${sinceArg} -n ${limit}`,
        { cwd: this.projectRoot }
      );

      const commits: GitCommit[] = [];
      const lines = stdout.trim().split('\n');

      let currentCommit: Partial<GitCommit> | null = null;

      for (const line of lines) {
        if (line.includes('|')) {
          // Commit header line
          if (currentCommit) {
            commits.push(currentCommit as GitCommit);
          }
          
          const parts = line.split('|');
          currentCommit = {
            hash: parts[0],
            hashShort: parts[1],
            author: parts[2],
            date: new Date(parts[3]),
            message: parts[4],
            files: [],
          };
        } else if (currentCommit && line.trim()) {
          // File change line (A=added, M=modified, D=deleted, R=renamed, C=copied)
          const fileParts = line.trim().split('\t');
          if (fileParts.length >= 2) {
            const statusStr = fileParts[0];
            const status = (statusStr === 'A' || statusStr === 'M' || statusStr === 'D' || statusStr === 'R' || statusStr === 'C') 
              ? statusStr as 'A' | 'M' | 'D' | 'R' | 'C' 
              : 'M' as 'A' | 'M' | 'D' | 'R' | 'C';
            const filePath = fileParts[fileParts.length - 1];
            (currentCommit as GitCommit).files.push({ path: filePath, status });
          }
        }
      }

      if (currentCommit) {
        commits.push(currentCommit as GitCommit);
      }

      return commits;
    } catch {
      return [];
    }
  }

  async getCommitDetails(hash: string): Promise<GitCommit | null> {
    try {
      const { stdout: header } = await execAsync(
        `git log -1 --pretty=format:"%H|%h|%an|%aI|%B" ${hash}`,
        { cwd: this.projectRoot }
      );
      
      const { stdout: changes } = await execAsync(
        `git show --name-status --format= ${hash}`,
        { cwd: this.projectRoot }
      );

      const headerParts = header.trim().split('|');
      const commit: GitCommit = {
        hash: headerParts[0],
        hashShort: headerParts[1],
        author: headerParts[2],
        date: new Date(headerParts[3]),
        message: headerParts[4],
        files: [],
      };

      // Parse file changes
      const changeLines = changes.trim().split('\n').slice(1); // Skip first empty line
      for (const changeLine of changeLines) {
        if (changeLine.trim()) {
          const parts = changeLine.trim().split('\t');
          if (parts.length >= 2) {
            const status = parts[0] as 'A' | 'M' | 'D' | 'R' | 'C';
            const filePath = parts[parts.length - 1];
            commit.files.push({ path: filePath, status });
          }
        }
      }

      return commit;
    } catch {
      return null;
    }
  }

  // ─── Analyze Commits ──────────────────────────────────────────────────────

  async analyzeCommits(commits?: GitCommit[]): Promise<CommitAnalysis[]> {
    if (!commits) {
      commits = await this.getCommits(50);
    }

    return commits.map((commit) => this.analyzeCommit(commit));
  }

  analyzeCommit(commit: GitCommit): CommitAnalysis {
    const type = this.detectCommitType(commit);
    const summary = this.extractSummary(commit);
    const decision = this.extractDecision(commit);
    
    const linesAdded = commit.files.reduce((sum, f) => sum + (f.additions || 0), 0);
    const linesRemoved = commit.files.reduce((sum, f) => sum + (f.deletions || 0), 0);

    return {
      commit,
      type,
      decision,
      summary,
      filesChanged: commit.files.length,
      linesAdded,
      linesRemoved,
    };
  }

  private detectCommitType(commit: GitCommit): CommitType {
    const message = commit.message.toLowerCase();
    
    for (const { patterns, type } of COMMIT_TYPE_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          return type;
        }
      }
    }
    
    // Fallback: analyze file patterns
    const filePaths = commit.files.map((f) => f.path.toLowerCase()).join(' ');
    
    if (filePaths.includes('test') || filePaths.includes('spec') || filePaths.includes('.test.') || filePaths.includes('.spec.')) {
      return 'test';
    }
    if (filePaths.includes('readme') || filePaths.includes('doc') || filePaths.includes('changelog')) {
      return 'docs';
    }
    if (filePaths.includes('.eslint') || filePaths.includes('.prettier') || filePaths.includes('.stylelint')) {
      return 'style';
    }
    if (filePaths.includes('dockerfile') || filePaths.includes('docker-compose') || filePaths.includes('.docker')) {
      return 'build';
    }
    if (filePaths.includes('.github/') || filePaths.includes('.gitlab/') || filePaths.includes('.circleci/')) {
      return 'ci';
    }
    if (filePaths.includes('package.json') || filePaths.includes('yarn.lock') || filePaths.includes('pnpm-lock')) {
      return 'chore';
    }
    
    return 'unknown';
  }

  private extractSummary(commit: GitCommit): string {
    const message = commit.message;
    
    // Remove commit type prefix
    const summary = message.replace(/^(feat|fix|docs|style|refactor|perf|test|chore|revert|migration|breaking|security|ci|build)(\(.+\))?:\s*/i, '');
    
    // Limit length
    return summary.slice(0, 200);
  }

  // ─── Decision Extraction ───────────────────────────────────────────────────

  extractDecision(commit: GitCommit): ArchitecturalDecision | undefined {
    const message = commit.message;
    const lowerMessage = message.toLowerCase();
    
    // Check if this looks like a decision commit
    let isDecision = false;
    for (const { patterns } of DECISION_KEYWORDS) {
      for (const pattern of patterns) {
        if (lowerMessage.includes(pattern.toLowerCase())) {
          isDecision = true;
          break;
        }
      }
      if (isDecision) break;
    }
    
    if (!isDecision) {
      // Check for migration patterns
      for (const { pattern } of MIGRATION_PATTERNS) {
        if (pattern.test(lowerMessage)) {
          isDecision = true;
          break;
        }
      }
    }
    
    if (!isDecision) return undefined;
    
    // Extract decision details from message
    const title = this.extractDecisionTitle(message);
    const context = this.extractDecisionContext(message, commit);
    const rationale = this.extractDecisionRationale(message);
    
    // Determine if this is a migration
    let decisionText = message;
    let migration: string | undefined;
    
    for (const { pattern, description } of MIGRATION_PATTERNS) {
      const match = message.match(pattern);
      if (match) {
        migration = description;
        break;
      }
    }
    
    const status: 'accepted' | 'rejected' | 'superseded' = 
      message.includes('revert') || message.includes('undo') ? 'rejected' : 'accepted';
    
    return {
      id: `dec-${commit.hashShort}`,
      date: commit.date,
      title: title || this.formatCommitTitle(commit.message),
      context: context || commit.message,
      decision: decisionText,
      rationale: rationale || '',
      status,
    };
  }

  private extractDecisionTitle(message: string): string {
    const patterns = [
      /(?:decide|decided|decision|choose|chose|chosen|select|selected|selecting|adopt|adopting|adopted|standardize|standardizing|standardized|implement|implementing|implemented)\s+(.+?)(?:\.|\:|$)/i,
      /(?:migrate|migration|switch|switching|move|moving)\s+(.+?)(?:\.|\:|$)/i,
      /(?:from\s+(.+?)\s+to\s+)/i,
      /(?:replace\s+(.+?)\s+with\s+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return '';
  }

  private extractDecisionContext(message: string, commit: GitCommit): string {
    const patterns = [
      /(?:because|since|as|due to|to address)\s+(.+)/i,
      /(?:context:\s*)(.+)/i,
      /(?:reason:\s*)(.+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    // Generate context from file changes
    const files = commit.files.map((f) => f.path);
    if (files.length > 0) {
      return `Affected files: ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`;
    }
    
    return '';
  }

  private extractDecisionRationale(message: string): string {
    const patterns = [
      /(?:rationale:\s*)(.+)/i,
      /(?:why\?\s*)(.+)/i,
      /(?:this allows us to\s*)(.+)/i,
      /(?:this enables\s*)(.+)/i,
      /(?:for\s+)(.+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return '';
  }

  private formatCommitTitle(message: string): string {
    const title = message.split('\n')[0].slice(0, 60);
    
    // Remove commit type prefix
    return title.replace(/^(feat|fix|docs|style|refactor|perf|test|chore|revert|migration|breaking|security|ci|build)(\(.+\))?:\s*/i, '');
  }

  // ─── Extract Decisions from Git History ────────────────────────────────────

  async extractDecisions(limit = 50): Promise<ArchitecturalDecision[]> {
    const commits = await this.getCommits(limit);
    const decisions: ArchitecturalDecision[] = [];
    
    for (const commit of commits) {
      const decision = this.extractDecision(commit);
      if (decision) {
        decisions.push(decision);
      }
    }
    
    // Sort by date (newest first)
    decisions.sort((a, b) => b.date.getTime() - a.date.getTime());
    
    return decisions;
  }

  // ─── Extract Migrations ────────────────────────────────────────────────────

  async extractMigrations(limit = 50): Promise<CommitAnalysis[]> {
    const commits = await this.getCommits(limit);
    const migrations: CommitAnalysis[] = [];
    
    for (const commit of commits) {
      const analysis = this.analyzeCommit(commit);
      if (analysis.type === 'migration' || 
          analysis.commit.message.toLowerCase().includes('migrate') ||
          analysis.commit.message.toLowerCase().includes('migration')) {
        migrations.push(analysis);
      }
    }
    
    return migrations;
  }

  // ─── Get Timeline of Changes ───────────────────────────────────────────────

  async getChangeTimeline(since?: Date): Promise<CommitAnalysis[]> {
    const commits = await this.getCommits(100, since);
    return this.analyzeCommits(commits);
  }

  // ─── Get Recent Major Changes ─────────────────────────────────────────────

  async getRecentMajorChanges(days = 7): Promise<CommitAnalysis[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    const commits = await this.getCommits(100, since);
    
    // Filter significant changes
    const analyses = await this.analyzeCommits(commits);
    return analyses.filter((analysis) => {
      // Major changes: more than 5 files or more than 50 lines changed
      return analysis.filesChanged > 5 || 
             analysis.linesAdded + analysis.linesRemoved > 50 ||
             analysis.type === 'migration' ||
             analysis.type === 'breaking';
    });
  }

  // ─── Detect Refactoring Patterns ───────────────────────────────────────────

  async detectRefactoringCommits(limit = 50): Promise<CommitAnalysis[]> {
    const commits = await this.getCommits(limit);
    const analyses = await this.analyzeCommits(commits);
    
    return analyses.filter((analysis) => {
      return analysis.type === 'refactor' ||
             (analysis.type === 'unknown' && 
              analysis.commit.message.toLowerCase().includes('refactor'));
    });
  }
}

// ─── Factory Function ────────────────────────────────────────────────────────

export async function analyzeGitHistory(projectRoot: string): Promise<CommitAnalysis[]> {
  const analyzer = new GitHistoryAnalyzer(projectRoot);
  if (!(await analyzer.isGitRepo())) {
    return [];
  }
  return analyzer.analyzeCommits();
}

export async function extractGitDecisions(projectRoot: string, limit = 50): Promise<ArchitecturalDecision[]> {
  const analyzer = new GitHistoryAnalyzer(projectRoot);
  if (!(await analyzer.isGitRepo())) {
    return [];
  }
  return analyzer.extractDecisions(limit);
}

