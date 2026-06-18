import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GitHistoryAnalyzer,
  analyzeGitHistory,
  extractGitDecisions,
  GitCommit,
} from '../index.js';

// Create a testable version of GitHistoryAnalyzer with mockable methods
class TestableGitHistoryAnalyzer extends GitHistoryAnalyzer {
  constructor(projectRoot: string) {
    super(projectRoot);
  }
}

describe('GitHistoryAnalyzer', () => {
  let analyzer: GitHistoryAnalyzer;
  const testProjectRoot = '/test/project';

  beforeEach(() => {
    analyzer = new GitHistoryAnalyzer(testProjectRoot);
  });

  describe('analyzeCommit', () => {
    it('detects commit type from message - feature', () => {
      const commit: GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'feat: add new feature',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/index.ts', status: 'A' }],
      };

      const analysis = (analyzer as any).analyzeCommit(commit);
      
      expect(analysis.type).toBe('feature');
      expect(analysis.filesChanged).toBe(1);
    });

    it('detects fix commit type', () => {
      const commit: GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'fix: resolve critical bug',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/bug.ts', status: 'M' }],
      };

      const analysis = (analyzer as any).analyzeCommit(commit);
      expect(analysis.type).toBe('fix');
    });

    it('detects migration commit type', () => {
      const commit: GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'migration: switch from JWT to Clerk',
        author: 'John Doe',
        date: new Date(),
        files: [
          { path: 'src/auth/clerk.ts', status: 'A' },
          { path: 'src/auth/jwt.ts', status: 'D' },
        ],
      };

      const analysis = (analyzer as any).analyzeCommit(commit);
      expect(analysis.type).toBe('migration');
    });

    it('detects test commit type from file patterns', () => {
      const commit: GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'update tests',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'src/__tests__/test.spec.ts', status: 'M' }],
      };

      const analysis = (analyzer as any).analyzeCommit(commit);
      expect(analysis.type).toBe('test');
    });
  });

  describe('extractDecision', () => {
    it('extracts decision from commit message with decision keywords', () => {
      const commit: GitCommit = {
        hash: 'abc123def456',
        hashShort: 'abc123',
        message: 'decide: use Clerk for authentication because it reduces maintenance burden',
        author: 'John Doe',
        date: new Date('2026-06-05'),
        files: [{ path: 'src/auth/clerk.ts', status: 'A' }],
      };

      const decision = analyzer.extractDecision(commit);
      
      expect(decision).toBeDefined();
      expect(decision?.title).toBeTruthy();
      expect(decision?.context).toBeTruthy();
      expect(decision?.status).toBe('accepted');
    });

    it('extracts migration decision', () => {
      const commit: GitCommit = {
        hash: 'abc123def456',
        hashShort: 'abc123',
        message: 'migrate from JWT to Clerk authentication',
        author: 'John Doe',
        date: new Date('2026-06-05'),
        files: [
          { path: 'src/auth/clerk.ts', status: 'A' },
          { path: 'src/auth/jwt.ts', status: 'D' },
        ],
      };

      const decision = analyzer.extractDecision(commit);
      
      expect(decision).toBeDefined();
      expect(decision?.title.length).toBeGreaterThan(0);
    });

    it('returns undefined for non-decision commits', () => {
      const commit: GitCommit = {
        hash: 'abc123',
        hashShort: 'abc123',
        message: 'fix: typo in readme',
        author: 'John Doe',
        date: new Date(),
        files: [{ path: 'README.md', status: 'M' }],
      };

      const decision = analyzer.extractDecision(commit);
      expect(decision).toBeUndefined();
    });

    it('marks reverted commits as rejected', () => {
      const commit: GitCommit = {
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
});

describe('Commit Type Detection Patterns', () => {
  it('should detect feature commits', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'feat: add login',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const analysis = (analyzer as any).analyzeCommit(commit);
    expect(analysis.type).toBe('feature');
  });

  it('should detect fix commits', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'fix: login bug',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const analysis = (analyzer as any).analyzeCommit(commit);
    expect(analysis.type).toBe('fix');
  });

  it('should detect docs commits', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'docs: update readme',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const analysis = (analyzer as any).analyzeCommit(commit);
    expect(analysis.type).toBe('docs');
  });

  it('should detect refactor commits', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'refactor: auth module',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const analysis = (analyzer as any).analyzeCommit(commit);
    expect(analysis.type).toBe('refactor');
  });
});

describe('Decision Extraction Patterns', () => {
  it('should extract decision with "decide" keyword', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'decide: use TypeScript for better type safety',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const decision = analyzer.extractDecision(commit);
    expect(decision).toBeDefined();
    expect(decision?.status).toBe('accepted');
  });

  it('should extract decision with "migration" keyword', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'migration: switch to Prisma ORM',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const decision = analyzer.extractDecision(commit);
    expect(decision).toBeDefined();
    expect(decision?.status).toBe('accepted');
  });

  it('should extract decision with "from X to Y" pattern', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'migrate from REST to GraphQL',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const decision = analyzer.extractDecision(commit);
    expect(decision).toBeDefined();
    expect(decision?.status).toBe('accepted');
  });

  it('should mark revert commits as rejected', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'revert: use new auth system',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const decision = analyzer.extractDecision(commit);
    expect(decision?.status).toBe('rejected');
  });

  it('should return undefined for regular commits', () => {
    const analyzer = new GitHistoryAnalyzer('/test');
    const commit: GitCommit = {
      hash: 'abc',
      hashShort: 'abc',
      message: 'fix: typo',
      author: 'Test',
      date: new Date(),
      files: [],
    };
    const decision = analyzer.extractDecision(commit);
    expect(decision).toBeUndefined();
  });
});
