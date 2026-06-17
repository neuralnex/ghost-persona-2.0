import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHistoryAnalyzer, extractGitDecisions, analyzeGitHistory } from '../index.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Mock execAsync for testing
vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

// Re-mock after vi.mock
const mockExecAsync = vi.mocked(execAsync);

describe('GitHistoryAnalyzer', () => {
  let analyzer: GitHistoryAnalyzer;
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    analyzer = new GitHistoryAnalyzer(testProjectRoot);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isGitRepo', () => {
    it('returns true for git repository', async () => {
      mockExecAsync.mockResolvedValue({ stdout: '.git\n', stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const result = await analyzer.isGitRepo();
      expect(result).toBe(true);
    });

    it('returns false for non-git directory', async () => {
      mockExecAsync.mockRejectedValue(new Error('Not a git repository'));
      
      const result = await analyzer.isGitRepo();
      expect(result).toBe(false);
    });
  });

  describe('getCommits', () => {
    it('parses git log output correctly', async () => {
      const mockOutput = `abc123def456|abc123|John Doe|2026-06-05T10:00:00Z|feat: add new feature\nA\tsrc/index.ts\nM\tsrc/utils.ts\nD\tsrc/old.ts\nabc123def456|abc123|John Doe|2026-06-05T10:00:00Z|fix: bug fix\nM\tsrc/bug.ts`;
      
      mockExecAsync.mockResolvedValue({ stdout: mockOutput, stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const commits = await analyzer.getCommits(10);
      
      expect(commits.length).toBeGreaterThan(0);
      expect(commits[0].hash).toBe('abc123def456');
      expect(commits[0].hashShort).toBe('abc123');
      expect(commits[0].author).toBe('John Doe');
      expect(commits[0].message).toContain('feat: add new feature');
      expect(commits[0].files.length).toBeGreaterThan(0);
    });

    it('returns empty array on error', async () => {
      mockExecAsync.mockRejectedValue(new Error('Git error'));
      
      const commits = await analyzer.getCommits(10);
      expect(commits).toEqual([]);
    });
  });

  describe('analyzeCommit', () => {
    it('detects commit type from message', async () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'feat: add new feature',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/index.ts', status: 'A' as const }],
      };

      const analysis = analyzer.analyzeCommit(commit);
      
      expect(analysis.type).toBe('feature');
      expect(analysis.filesChanged).toBe(1);
    });

    it('detects fix commit type', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'fix: resolve critical bug',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/bug.ts', status: 'M' as const }],
      };

      const analysis = analyzer.analyzeCommit(commit);
      expect(analysis.type).toBe('fix');
    });

    it('detects migration commit type', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'migration: switch from JWT to Clerk',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/auth/clerk.ts', status: 'A' as const }, { path: 'src/auth/jwt.ts', status: 'D' as const }],
      };

      const analysis = analyzer.analyzeCommit(commit);
      expect(analysis.type).toBe('migration');
    });

    it('detects test commit type from file patterns', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'update tests',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/__tests__/test.spec.ts', status: 'M' as const }],
      };

      const analysis = analyzer.analyzeCommit(commit);
      expect(analysis.type).toBe('test');
    });
  });

  describe('extractDecision', () => {
    it('extracts decision from commit message with decision keywords', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123def456',
        hashShort: 'abc123',
        message: 'decide: use Clerk for authentication because it reduces maintenance burden',
        author: 'John Doe',
        date: new Date('2026-06-05'),
        files: [{ path: 'src/auth/clerk.ts', status: 'A' as const }],
      };

      const decision = analyzer.extractDecision(commit);
      
      expect(decision).toBeDefined();
      expect(decision?.title).toBeTruthy();
      expect(decision?.context).toBeTruthy();
      expect(decision?.status).toBe('accepted');
    });

    it('extracts migration decision', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123def456',
        hashShort: 'abc123',
        message: 'migrate from JWT to Clerk authentication',
        author: 'John Doe',
        date: new Date('2026-06-05'),
        files: [{ path: 'src/auth/clerk.ts', status: 'A' as const }, { path: 'src/auth/jwt.ts', status: 'D' as const }],
      };

      const decision = analyzer.extractDecision(commit);
      
      expect(decision).toBeDefined();
      expect(decision?.title).toContain('migrate');
    });

    it('returns undefined for non-decision commits', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'fix: typo in readme',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'README.md', status: 'M' as const }],
      };

      const decision = analyzer.extractDecision(commit);
      expect(decision).toBeUndefined();
    });

    it('marks reverted commits as rejected', () => {
      const commit: import('../index.js').GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'revert: migration to Clerk',
        author: 'John Doe',
        date: new Date(),
        files: [],
      };

      const decision = analyzer.extractDecision(commit);
      expect(decision?.status).toBe('rejected');
    });
  });

  describe('extractDecisions', () => {
    it('returns decisions from commit history', async () => {
      const mockOutput = `abc123def456|abc123|John Doe|2026-06-05T10:00:00Z|decide: use Clerk for auth\nA\tsrc/auth/clerk.ts\nabc123def456|def456|Jane Doe|2026-06-06T10:00:00Z|fix: typo\nM\tREADME.md`;
      
      mockExecAsync.mockResolvedValue({ stdout: mockOutput, stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const decisions = await analyzer.extractDecisions(10);
      
      expect(decisions.length).toBeGreaterThan(0);
      expect(decisions[0].id).toContain('abc123');
    });
  });

  describe('extractMigrations', () => {
    it('returns migration commits', async () => {
      const mockOutput = `abc123def456|abc123|John Doe|2026-06-05T10:00:00Z|migrate: from JWT to Clerk\nA\tsrc/auth/clerk.ts\nD\tsrc/auth/jwt.ts\ndef456abc123|def456|Jane Doe|2026-06-06T10:00:00Z|fix: typo\nM\tREADME.md`;
      
      mockExecAsync.mockResolvedValue({ stdout: mockOutput, stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const migrations = await analyzer.extractMigrations(10);
      
      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations[0].type).toBe('migration');
    });
  });

  describe('getRecentMajorChanges', () => {
    it('returns significant changes from the last week', async () => {
      const mockOutput = `abc123def456|abc123|John Doe|2026-06-05T10:00:00Z|feat: add new feature\nA\tsrc/file1.ts\nA\tsrc/file2.ts\nA\tsrc/file3.ts\nA\tsrc/file4.ts\nA\tsrc/file5.ts\nA\tsrc/file6.ts`;
      
      mockExecAsync.mockResolvedValue({ stdout: mockOutput, stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const changes = await analyzer.getRecentMajorChanges(7);
      
      expect(changes.length).toBeGreaterThan(0);
      expect(changes[0].filesChanged).toBeGreaterThan(5);
    });
  });
});

describe('Factory Functions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('analyzeGitHistory', () => {
    it('returns empty array for non-git repo', async () => {
      mockExecAsync.mockRejectedValue(new Error('Not a git repository'));
      
      const result = await analyzeGitHistory('/non/git');
      expect(result).toEqual([]);
    });

    it('returns commit analyses for git repo', async () => {
      mockExecAsync.mockResolvedValue({ stdout: `abc123|abc|John|2026-01-01|feat: test\nA\ttest.ts`, stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const result = await analyzeGitHistory('/git/repo');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('extractGitDecisions', () => {
    it('returns empty array for non-git repo', async () => {
      mockExecAsync.mockRejectedValue(new Error('Not a git repository'));
      
      const result = await extractGitDecisions('/non/git');
      expect(result).toEqual([]);
    });

    it('returns decisions for git repo', async () => {
      mockExecAsync.mockResolvedValue({ stdout: `abc123|abc|John|2026-01-01|decide: use React`, stderr: '' } as unknown as { stdout: string; stderr: string });
      
      const result = await extractGitDecisions('/git/repo');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
