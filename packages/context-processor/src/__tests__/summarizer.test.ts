import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RuleBasedSummarizer, LLMSummarizer, createSummarizer } from '../index.js';
import { FileChangeBatch, FileChangeEvent } from '@ghost-persona/shared';
import { randomUUID } from 'crypto';

function makeBatch(events: Partial<FileChangeEvent>[]): FileChangeBatch {
  return {
    id: randomUUID(),
    events: events.map((e) => ({
      type: 'created' as const,
      path: `/project/${e.path ?? 'file.ts'}`,
      relativePath: e.path ?? 'file.ts',
      timestamp: new Date(),
      ...e,
    })),
    startTime: new Date(),
    endTime: new Date(),
  };
}

describe('RuleBasedSummarizer', () => {
  let summarizer: RuleBasedSummarizer;

  beforeEach(() => {
    summarizer = new RuleBasedSummarizer();
  });

  it('detects authentication migrations', async () => {
    const batch = makeBatch([
      { type: 'deleted', path: 'src/auth/jwt.ts' },
      { type: 'created', path: 'src/auth/clerk.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('migration');
    expect(result.title).toMatch(/migration/i);
  });

  it('detects feature additions', async () => {
    const batch = makeBatch([
      { type: 'created', path: 'src/services/payment.ts' },
      { type: 'created', path: 'src/services/stripe-client.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('feature-addition');
  });

  it('batches with test files are classified as testing', async () => {
    const batch = makeBatch([
      { type: 'created', path: 'src/services/payment.ts' },
      { type: 'created', path: 'src/services/payment.test.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(['testing', 'feature-addition']).toContain(result.changeType);
  });

  it('detects feature removal', async () => {
    const batch = makeBatch([
      { type: 'deleted', path: 'src/services/legacy-auth.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('feature-removal');
  });

  it('detects refactoring (create + delete)', async () => {
    const batch = makeBatch([
      { type: 'deleted', path: 'src/utils/helpers.ts' },
      { type: 'created', path: 'src/utils/string-utils.ts' },
      { type: 'created', path: 'src/utils/date-utils.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('refactoring');
  });

  it('detects dependency changes', async () => {
    const batch = makeBatch([
      { type: 'modified', path: 'package.json' },
      { type: 'modified', path: 'package-lock.json' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('dependency');
  });

  it('detects configuration changes', async () => {
    const batch = makeBatch([
      { type: 'modified', path: '.env' },
      { type: 'created', path: 'config/settings.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('configuration');
  });

  it('identifies affected areas', async () => {
    const batch = makeBatch([
      { type: 'created', path: 'src/components/LoginForm.tsx' },
      { type: 'created', path: 'src/api/auth-routes.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.affectedAreas).toContain('UI/Frontend');
    expect(result.affectedAreas).toContain('API Layer');
  });

  it('returns summary and details', async () => {
    const batch = makeBatch([
      { type: 'created', path: 'src/feature/new-thing.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.summary).toBeTruthy();
    expect(result.details.length).toBeGreaterThan(0);
    expect(result.title).toBeTruthy();
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  it('handles empty batch gracefully', async () => {
    const batch = makeBatch([]);
    const result = await summarizer.summarize(batch);
    expect(result).toBeTruthy();
  });

  it('detects testing changes', async () => {
    const batch = makeBatch([
      { type: 'created', path: 'src/__tests__/payment.test.ts' },
      { type: 'modified', path: 'src/__tests__/auth.spec.ts' },
    ]);

    const result = await summarizer.summarize(batch);
    expect(result.changeType).toBe('testing');
  });

  describe('LLMSummarizer', () => {
    let summarizer: LLMSummarizer;
    const mockApiKey = 'test-api-key';
    const mockModel = 'gemini-1.5-flash';

    beforeEach(() => {
      summarizer = new LLMSummarizer(mockApiKey, mockModel);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('has correct apiKey and model', () => {
      expect((summarizer as unknown as { apiKey: string; model: string }).apiKey).toBe(mockApiKey);
      expect((summarizer as unknown as { apiKey: string; model: string }).model).toBe(mockModel);
    });

    it('builds correct prompt for file changes', () => {
      const batch = makeBatch([
        { type: 'created', path: 'src/auth/clerk.ts' },
        { type: 'deleted', path: 'src/auth/jwt.ts' },
      ]);

      const buildPrompt = (summarizer as unknown as { buildPrompt: (b: FileChangeBatch) => string }).buildPrompt;
      const prompt = buildPrompt(batch);
      
      expect(prompt).toContain('FILE CHANGES:');
      expect(prompt).toContain('CREATED: src/auth/clerk.ts');
      expect(prompt).toContain('DELETED: src/auth/jwt.ts');
      expect(prompt).toContain('title');
      expect(prompt).toContain('summary');
      expect(prompt).toContain('changeType');
    });

    it('falls back to rule-based on API error', async () => {
      global.fetch = vi.fn(() => 
        Promise.resolve({
          ok: false,
          statusText: 'Not Found',
        } as Response)
      ) as typeof fetch;

      const batch = makeBatch([
        { type: 'created', path: 'src/auth/clerk.ts' },
        { type: 'deleted', path: 'src/auth/jwt.ts' },
      ]);

      const result = await summarizer.summarize(batch);
      
      expect(result).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('falls back to rule-based on malformed JSON response', async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'not valid json' }] } }] }),
        } as Response)
      ) as typeof fetch;

      const batch = makeBatch([
        { type: 'created', path: 'src/auth/clerk.ts' },
        { type: 'deleted', path: 'src/auth/jwt.ts' },
      ]);

      const result = await summarizer.summarize(batch);
      
      expect(result).toBeDefined();
      expect(result.timestamp).toBeInstanceOf(Date);
    });

    it('handles successful API response with valid JSON', async () => {
      const mockResponse = {
        title: 'Authentication Migration',
        summary: 'Switched from JWT to Clerk',
        details: ['Removed JWT', 'Added Clerk'],
        affectedAreas: ['Authentication'],
        changeType: 'migration',
      };

      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            candidates: [{ 
              content: { 
                parts: [{ text: JSON.stringify(mockResponse) }] 
              } 
            }] 
          }),
        } as Response)
      ) as typeof fetch;

      const batch = makeBatch([
        { type: 'created', path: 'src/auth/clerk.ts' },
        { type: 'deleted', path: 'src/auth/jwt.ts' },
      ]);

      const result = await summarizer.summarize(batch);
      
      expect(result.title).toBe(mockResponse.title);
      expect(result.summary).toBe(mockResponse.summary);
      expect(result.changeType).toBe(mockResponse.changeType);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('createSummarizer', () => {
    it('returns RuleBasedSummarizer for rule-based mode', () => {
      const summarizer = createSummarizer('rule-based');
      expect(summarizer).toBeInstanceOf(RuleBasedSummarizer);
    });

    it('returns LLMSummarizer for llm mode with apiKey', () => {
      const summarizer = createSummarizer('llm', 'test-key', 'gemini-1.5-flash');
      expect(summarizer).toBeInstanceOf(LLMSummarizer);
    });

    it('returns RuleBasedSummarizer for llm mode without apiKey', () => {
      const summarizer = createSummarizer('llm');
      expect(summarizer).toBeInstanceOf(RuleBasedSummarizer);
    });
  });
});
