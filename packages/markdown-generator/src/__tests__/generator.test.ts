import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarkdownGenerator } from '../index.js';
import { GhostConfig, DEFAULT_CONFIG, GHOST_DIR, MEMORY_FILES, ProjectSnapshot } from '@ghost-persona/shared';
import { ProcessedContext } from '@ghost-persona/context-processor';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

function makeConfig(projectRoot: string): GhostConfig {
  return {
    ...DEFAULT_CONFIG,
    projectName: 'Test Project',
    projectRoot,
    ghostDir: path.join(projectRoot, GHOST_DIR),
  };
}

function makeContext(overrides: Partial<ProcessedContext> = {}): ProcessedContext {
  return {
    title: 'Authentication Migration',
    summary: 'Switched from JWT to Clerk for managed auth.',
    details: ['Removed: src/auth/jwt.ts', 'Added: src/auth/clerk.ts'],
    affectedAreas: ['Authentication', 'API Layer'],
    changeType: 'migration',
    timestamp: new Date('2026-06-05T10:00:00Z'),
    ...overrides,
  };
}

describe('MarkdownGenerator', () => {
  let tmpDir: string;
  let generator: MarkdownGenerator;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-md-test-'));
    generator = new MarkdownGenerator(makeConfig(tmpDir));
    await generator.initialize();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('creates all memory files', async () => {
      const ghostDir = path.join(tmpDir, GHOST_DIR);
      const files = await fs.readdir(ghostDir);

      for (const memFile of MEMORY_FILES) {
        expect(files).toContain(memFile);
      }
    });

    it('creates snapshots directory', async () => {
      const snapshotsDir = path.join(tmpDir, GHOST_DIR, 'snapshots');
      await expect(fs.access(snapshotsDir)).resolves.toBeUndefined();
    });

    it('creates config.json', async () => {
      const configPath = path.join(tmpDir, GHOST_DIR, 'config.json');
      await expect(fs.access(configPath)).resolves.toBeUndefined();
    });

    it('does not overwrite existing memory files on re-init', async () => {
      const projectPath = path.join(tmpDir, GHOST_DIR, 'project.md');
      await fs.writeFile(projectPath, '# Custom Content', 'utf-8');

      // Re-initialize
      await generator.initialize();

      const content = await fs.readFile(projectPath, 'utf-8');
      expect(content).toBe('# Custom Content');
    });

    it('project.md contains project name', async () => {
      const content = await generator.readFile('project.md');
      expect(content).toContain('Test Project');
    });
  });

  describe('appendFileHistory', () => {
    it('inserts entry after ## Changelog header', async () => {
      const ctx = makeContext({ changeType: 'feature-addition', title: 'New Payment Service' });
      await generator.appendFileHistory(ctx);

      const content = await generator.readFile('file-history.md');
      expect(content).toContain('New Payment Service');
      expect(content).toContain('2026-06-05');
    });

    it('prepends entries (newest first)', async () => {
      const ctx1 = makeContext({ title: 'First Change', timestamp: new Date('2026-06-01') });
      const ctx2 = makeContext({ title: 'Second Change', timestamp: new Date('2026-06-05') });

      await generator.appendFileHistory(ctx1);
      await generator.appendFileHistory(ctx2);

      const content = await generator.readFile('file-history.md');
      const idx1 = content.indexOf('First Change');
      const idx2 = content.indexOf('Second Change');

      // Second change should appear before first (prepend)
      expect(idx2).toBeLessThan(idx1);
    });

    it('updates the last-updated timestamp', async () => {
      const before = await generator.readFile('file-history.md');
      await new Promise((r) => setTimeout(r, 10));
      await generator.appendFileHistory(makeContext());

      const after = await generator.readFile('file-history.md');
      const tsRegex = /_Last updated: (.+)_/;
      const beforeTs = before.match(tsRegex)?.[1];
      const afterTs = after.match(tsRegex)?.[1];

      expect(afterTs).not.toBe(beforeTs);
    });
  });

  describe('appendDecision', () => {
    it('records migration as a decision', async () => {
      await generator.appendDecision(makeContext({ changeType: 'migration' }));
      const content = await generator.readFile('decisions.md');
      expect(content).toContain('Authentication Migration');
      expect(content).toContain('Accepted');
    });

    it('records refactoring as a decision', async () => {
      await generator.appendDecision(makeContext({ changeType: 'refactoring', title: 'Auth Refactor' }));
      const content = await generator.readFile('decisions.md');
      expect(content).toContain('Auth Refactor');
    });

    it('skips non-migration, non-refactoring contexts', async () => {
      const before = await generator.readFile('decisions.md');
      await generator.appendDecision(makeContext({ changeType: 'feature-addition' }));
      const after = await generator.readFile('decisions.md');
      expect(after).toBe(before);
    });
  });

  describe('updateCurrentWork', () => {
    it('updates Active Focus section', async () => {
      await generator.updateCurrentWork(makeContext({ title: 'Implement Clerk Auth' }));
      const content = await generator.readFile('current-work.md');
      expect(content).toContain('Implement Clerk Auth');
    });

    it('includes affected areas', async () => {
      await generator.updateCurrentWork(makeContext({ affectedAreas: ['Authentication', 'Database'] }));
      const content = await generator.readFile('current-work.md');
      expect(content).toContain('Authentication');
    });
  });

  describe('createSnapshot', () => {
    it('creates a snapshot file in snapshots/', async () => {
      await generator.createSnapshot({
        id: 'test-snapshot-id',
        date: new Date('2026-06-05'),
        commit: 'abc123',
        branch: 'main',
        recentChanges: ['Auth migration', 'Redis caching'],
        currentGoal: 'Finish auth flow',
        knownIssues: ['Session edge case'],
        nextTasks: ['Write tests'],
        memorySnapshot: {} as ProjectSnapshot['memorySnapshot'],
      });

      const snapshotsDir = path.join(tmpDir, GHOST_DIR, 'snapshots');
      const files = await fs.readdir(snapshotsDir);
      expect(files.length).toBeGreaterThan(0);

      const content = await fs.readFile(path.join(snapshotsDir, files[0]), 'utf-8');
      expect(content).toContain('Finish auth flow');
      expect(content).toContain('Auth migration');
      expect(content).toContain('abc123');
    });
  });

  describe('generateBrief', () => {
    it('returns a non-empty markdown string', async () => {
      const brief = await generator.generateBrief();
      expect(brief).toBeTruthy();
      expect(brief).toContain('Ghost Persona Brief');
    });

    it('includes project name', async () => {
      const brief = await generator.generateBrief();
      expect(brief).toContain('Test Project');
    });

    it('includes a generation timestamp', async () => {
      const brief = await generator.generateBrief();
      expect(brief).toMatch(/Generated:/);
    });
  });

  describe('generateContextBrief', () => {
    it('returns a ContextBrief object', async () => {
      const brief = await generator.generateContextBrief();
      expect(brief).toHaveProperty('project');
      expect(brief).toHaveProperty('architecture');
      expect(brief).toHaveProperty('recentChanges');
      expect(brief).toHaveProperty('activeTasks');
      expect(brief).toHaveProperty('decisions');
      expect(brief).toHaveProperty('timestamp');
    });
  });

  describe('readAllMemory', () => {
    it('returns content for all memory files', async () => {
      const memory = await generator.readAllMemory();
      for (const f of MEMORY_FILES) {
        expect(memory[f]).toBeDefined();
      }
    });
  });
});
