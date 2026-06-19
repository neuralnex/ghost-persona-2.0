import { FileChangeBatch, FileChangeEvent } from '@ghost-persona/shared';
import path from 'path';

export interface ProcessedContext {
  title: string;
  summary: string;
  details: string[];
  affectedAreas: string[];
  changeType: ChangeCategory;
  timestamp: Date;
}

export type ChangeCategory =
  | 'feature-addition'
  | 'feature-removal'
  | 'refactoring'
  | 'migration'
  | 'configuration'
  | 'dependency'
  | 'documentation'
  | 'testing'
  | 'general';

export interface Summarizer {
  summarize(batch: FileChangeBatch): Promise<ProcessedContext>;
}

// ─── Rule-Based Summarizer (v1) ───────────────────────────────────────────────

const AREA_PATTERNS: Array<{ pattern: RegExp; area: string }> = [
  { pattern: /auth|login|jwt|oauth|clerk|session/i, area: 'Authentication' },
  { pattern: /api|route|endpoint|controller|handler/i, area: 'API Layer' },
  { pattern: /db|database|migration|schema|model|prisma|drizzle|sequelize/i, area: 'Database' },
  { pattern: /test|spec|__tests__|\.test\.|\.spec\./i, area: 'Testing' },
  { pattern: /config|\.env|settings|constants/i, area: 'Configuration' },
  { pattern: /ui|component|view|page|layout|style|css|scss/i, area: 'UI/Frontend' },
  { pattern: /service|provider|repository|store/i, area: 'Business Logic' },
  { pattern: /package\.json|yarn\.lock|package-lock|pnpm-lock/i, area: 'Dependencies' },
  { pattern: /readme|doc|changelog|license/i, area: 'Documentation' },
  { pattern: /dockerfile|docker-compose|\.yml|\.yaml|k8s|kubernetes/i, area: 'Infrastructure' },
  { pattern: /middleware|interceptor|guard|filter/i, area: 'Middleware' },
  { pattern: /util|helper|lib|shared|common/i, area: 'Utilities' },
];

const MIGRATION_PAIRS: Array<{ from: RegExp; to: RegExp; description: string }> = [
  { from: /jwt/i, to: /clerk|auth0|supabase/i, description: 'Authentication provider migration' },
  { from: /express/i, to: /fastify|hono|koa/i, description: 'HTTP framework migration' },
  { from: /mongoose/i, to: /prisma|drizzle|typeorm/i, description: 'ORM migration' },
  { from: /redux/i, to: /zustand|jotai|recoil/i, description: 'State management migration' },
  { from: /webpack/i, to: /vite|esbuild|turbopack/i, description: 'Bundler migration' },
  { from: /jest/i, to: /vitest|bun/i, description: 'Test runner migration' },
  { from: /javascript|\.js$/i, to: /typescript|\.ts$/i, description: 'TypeScript adoption' },
];

export class RuleBasedSummarizer implements Summarizer {
  async summarize(batch: FileChangeBatch): Promise<ProcessedContext> {
    const created = batch.events.filter((e: FileChangeEvent) => e.type === 'created');
    const deleted = batch.events.filter((e: FileChangeEvent) => e.type === 'deleted');
    const modified = batch.events.filter((e: FileChangeEvent) => e.type === 'modified');
    const renamed = batch.events.filter((e: FileChangeEvent) => e.type === 'renamed');

    const allPaths = batch.events.map((e: FileChangeEvent) => e.relativePath);
    const affectedAreas = this.detectAreas(allPaths);
    const migration = this.detectMigration(created, deleted);
    const changeType = this.detectChangeCategory(batch.events, migration);

    const { title, summary, details } = this.buildNarrative({
      created,
      deleted,
      modified,
      renamed,
      migration,
      changeType,
      affectedAreas,
    });

    return {
      title,
      summary,
      details,
      affectedAreas,
      changeType,
      timestamp: batch.endTime,
    };
  }

  private detectAreas(paths: string[]): string[] {
    const areas = new Set<string>();
    for (const filePath of paths) {
      for (const { pattern, area } of AREA_PATTERNS) {
        if (pattern.test(filePath)) {
          areas.add(area);
        }
      }
    }
    if (areas.size === 0) areas.add('General');
    return Array.from(areas);
  }

  private detectMigration(
    created: FileChangeEvent[],
    deleted: FileChangeEvent[]
  ): string | null {
    const createdNames = created.map((e) => e.relativePath).join(' ');
    const deletedNames = deleted.map((e) => e.relativePath).join(' ');

    for (const pair of MIGRATION_PAIRS) {
      if (pair.from.test(deletedNames) && pair.to.test(createdNames)) {
        return pair.description;
      }
    }
    return null;
  }

  private detectChangeCategory(
    events: FileChangeEvent[],
    migration: string | null
  ): ChangeCategory {
    if (migration) return 'migration';

    const paths = events.map((e) => e.relativePath).join(' ');
    const created = events.filter((e) => e.type === 'created');
    const deleted = events.filter((e) => e.type === 'deleted');

    if (/package\.json|yarn\.lock|package-lock|pnpm-lock/i.test(paths)) return 'dependency';
    if (/readme|doc|changelog/i.test(paths)) return 'documentation';
    if (/test|spec/i.test(paths)) return 'testing';
    if (/config|\.env|settings/i.test(paths)) return 'configuration';

    if (created.length > 0 && deleted.length === 0) return 'feature-addition';
    if (deleted.length > 0 && created.length === 0) return 'feature-removal';
    if (created.length > 0 && deleted.length > 0) return 'refactoring';

    return 'general';
  }

  private buildNarrative(ctx: {
    created: FileChangeEvent[];
    deleted: FileChangeEvent[];
    modified: FileChangeEvent[];
    renamed: FileChangeEvent[];
    migration: string | null;
    changeType: ChangeCategory;
    affectedAreas: string[];
  }): { title: string; summary: string; details: string[] } {
    const { created, deleted, modified, renamed, migration, changeType, affectedAreas } = ctx;
    const details: string[] = [];

    if (created.length > 0) {
      details.push(`Added ${created.length} file(s): ${this.formatPaths(created)}`);
    }
    if (deleted.length > 0) {
      details.push(`Removed ${created.length} file(s): ${this.formatPaths(deleted)}`);
    }
    if (modified.length > 0) {
      details.push(`Modified ${modified.length} file(s): ${this.formatPaths(modified)}`);
    }
    if (renamed.length > 0) {
      details.push(
        `Renamed: ${renamed.map((e) => `${e.oldPath} → ${e.relativePath}`).join(', ')}`
      );
    }

    if (migration) {
      return {
        title: migration,
        summary: `${migration} detected. ${this.summarizeFiles(created, deleted)}`,
        details,
      };
    }

    const areaStr = affectedAreas.slice(0, 2).join(' & ');

    switch (changeType) {
      case 'feature-addition':
        return {
          title: `${areaStr} — New additions`,
          summary: `Introduced ${created.length} new file(s) in ${areaStr.toLowerCase()}. ${this.inferIntent(created)}`,
          details,
        };
      case 'feature-removal':
        return {
          title: `${areaStr} — Removal`,
          summary: `Removed ${deleted.length} file(s) from ${areaStr.toLowerCase()}. ${this.inferRemovalIntent(deleted)}`,
          details,
        };
      case 'refactoring':
        return {
          title: `${areaStr} — Refactoring`,
          summary: `Restructured ${areaStr.toLowerCase()}: replaced ${deleted.length} file(s) with ${created.length} new file(s).`,
          details,
        };
      case 'dependency':
        return {
          title: 'Dependency Update',
          summary: 'Package dependencies were added, removed, or updated.',
          details,
        };
      case 'configuration':
        return {
          title: 'Configuration Change',
          summary: `Project configuration updated across ${modified.length + created.length} file(s).`,
          details,
        };
      case 'testing':
        return {
          title: `${areaStr} — Test Coverage`,
          summary: `Test files added or updated for ${areaStr.toLowerCase()}.`,
          details,
        };
      case 'documentation':
        return {
          title: 'Documentation Update',
          summary: `Project documentation updated.`,
          details,
        };
      default:
        return {
          title: `${areaStr} — Changes`,
          summary: `${this.totalFiles(created, deleted, modified, renamed)} file(s) changed in ${areaStr.toLowerCase()}.`,
          details,
        };
    }
  }

  private formatPaths(events: FileChangeEvent[]): string {
    const MAX_SHOW = 3;
    const shown = events.slice(0, MAX_SHOW).map((e) => `\`${e.relativePath}\``);
    const rest = events.length - MAX_SHOW;
    if (rest > 0) shown.push(`+${rest} more`);
    return shown.join(', ');
  }

  private summarizeFiles(created: FileChangeEvent[], deleted: FileChangeEvent[]): string {
    const parts: string[] = [];
    if (deleted.length > 0) parts.push(`Removed: ${this.formatPaths(deleted)}`);
    if (created.length > 0) parts.push(`Introduced: ${this.formatPaths(created)}`);
    return parts.join('. ');
  }

  private inferIntent(created: FileChangeEvent[]): string {
    const names = created.map((e) => path.basename(e.relativePath)).join(' ');
    if (/auth|login/i.test(names)) return 'Likely establishing authentication flow.';
    if (/service/i.test(names)) return 'Likely introducing a new service layer.';
    if (/test|spec/i.test(names)) return 'Expanding test coverage.';
    if (/component|view|page/i.test(names)) return 'Adding new UI elements.';
    return '';
  }

  private inferRemovalIntent(deleted: FileChangeEvent[]): string {
    const names = deleted.map((e) => path.basename(e.relativePath)).join(' ');
    if (/test|spec/i.test(names)) return 'Cleaning up obsolete tests.';
    if (/legacy|old|deprecated/i.test(names)) return 'Removing legacy code.';
    return 'Likely simplification or cleanup.';
  }

  private totalFiles(...groups: FileChangeEvent[][]): number {
    return groups.reduce((acc, g) => acc + g.length, 0);
  }
}

// ─── LLM Summarizer (v2 — Gemini) ────────────────────────────────────────────

export class LLMSummarizer implements Summarizer {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxPromptTokens: number = 15000;

  constructor(apiKey: string, model = 'gemini-2.5-flash', maxPromptTokens?: number) {
    this.apiKey = apiKey;
    this.model = model;
    if (maxPromptTokens) this.maxPromptTokens = maxPromptTokens;
  }

  async summarize(batch: FileChangeBatch): Promise<ProcessedContext> {
    const prompt = this.buildPrompt(batch);
    
    // Enforce strict density tokens - strip boilerplate to prevent token inflation
    const optimizedPrompt = this.optimizePromptForTokenDensity(prompt);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: optimizedPrompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      }
    );

    if (!response.ok) {
      // Fallback to rule-based if API call fails
      return new RuleBasedSummarizer().summarize(batch);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };

    const text = data.candidates[0]?.content?.parts[0]?.text ?? '{}';

    try {
      const parsed = JSON.parse(text) as ProcessedContext;
      return { ...parsed, timestamp: batch.endTime };
    } catch {
      // Fallback to rule-based if LLM response is malformed
      return new RuleBasedSummarizer().summarize(batch);
    }
  }

  /**
   * Optimize prompt for token density by stripping boilerplate and redundant text
   * Uses deterministic AST validation to prevent LLM context bloat
   */
  private optimizePromptForTokenDensity(prompt: string): string {
    // Boilerplate patterns to strip
    const BOILERPLATE_PATTERNS = [
      /^\/\*\*[\s\S]*?\*\//,  // Remove leading JSDoc comments
      /^\/\/[\s\S]*?\n/,       // Remove leading single-line comments
      /^\s*$/,                  // Remove leading empty lines
      /\n\s*\n/g,              // Collapse multiple newlines
      /\n+$/                   // Remove trailing newlines
    ];

    let optimized = prompt;
    
    // Apply boilerplate stripping
    for (const pattern of BOILERPLATE_PATTERNS) {
      optimized = optimized.replace(pattern, '');
    }
    
    // Strip redundant whitespace
    optimized = optimized.trim();
    
    // Enforce max prompt length to prevent token inflation
    if (optimized.length > this.maxPromptTokens * 4) { // rough estimate: 4 chars = 1 token
      console.warn(`LLM prompt truncated from ${optimized.length} to ${this.maxPromptTokens * 4} characters to prevent token inflation`);
      optimized = optimized.substring(0, this.maxPromptTokens * 4) + '... [truncated for token density]';
    }
    
    return optimized;
  }

  private buildPrompt(batch: FileChangeBatch): string {
    const events = batch.events
      .map((e: FileChangeEvent) => {
        if (e.type === 'renamed') return `RENAMED: ${e.oldPath} → ${e.relativePath}`;
        return `${e.type.toUpperCase()}: ${e.relativePath}`;
      })
      .join('\n');

    return `You are analyzing file changes in a software project. Given these changes, produce a structured JSON summary.

FILE CHANGES:
${events}

Respond ONLY with valid JSON matching this schema:
{
  "title": "Short title for what changed (max 60 chars)",
  "summary": "1-2 sentence developer-friendly explanation of what changed and likely why",
  "details": ["array", "of", "specific", "change", "details"],
  "affectedAreas": ["Authentication", "API Layer", etc],
  "changeType": "one of: feature-addition | feature-removal | refactoring | migration | configuration | dependency | documentation | testing | general"
}`;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSummarizer(
  mode: 'rule-based' | 'llm',
  llmApiKey?: string,
  llmModel?: string
): Summarizer {
  if (mode === 'llm' && llmApiKey) {
    return new LLMSummarizer(llmApiKey, llmModel);
  }
  return new RuleBasedSummarizer();
}

export { FileChangeBatch };
