import { describe, it, expect, beforeEach } from 'vitest';
import { 
  NLQueryProcessor, 
  NLQueryConfig,
  createNLQueryProcessor,
  QueryIntent,
} from '../index.js';

describe('NLQueryProcessor', () => {
  let processor: NLQueryProcessor;

  beforeEach(() => {
    processor = new NLQueryProcessor({ enabled: false });
  });

  describe('Configuration', () => {
    it('should be created via factory function', () => {
      const customConfig: Partial<NLQueryConfig> = {
        useLLM: true,
        llmApiKey: 'test-key',
      };
      const queryProcessor = createNLQueryProcessor(customConfig);
      expect(queryProcessor).toBeInstanceOf(NLQueryProcessor);
    });
  });

  describe('Query Parsing', () => {
    it('should parse simple queries', () => {
      const parsed = processor.parseQuery('Find authentication code');
      expect(parsed.query).toBe('Find authentication code');
      expect(parsed.intent).toBe('search');
    });

    it('should detect temporal queries', () => {
      const parsed = processor.parseQuery('What changed last week?');
      expect(parsed.intent).toBe('temporal');
      expect(parsed.dateRange).toBeDefined();
    });

    it('should detect decision queries', () => {
      const parsed = processor.parseQuery('Why did we choose Clerk?');
      expect(parsed.intent).toBe('decision');
    });

    it('should detect explanation queries', () => {
      const parsed = processor.parseQuery('How does authentication work?');
      expect(parsed.intent).toBe('explanation');
    });

    it('should extract keywords', () => {
      const parsed = processor.parseQuery('Find authentication and database code');
      expect(parsed.keywords).toContain('authentication');
      expect(parsed.keywords).toContain('database');
      expect(parsed.keywords).toContain('code');
    });

    it('should detect yesterday queries', () => {
      const parsed = processor.parseQuery('What happened yesterday?');
      expect(parsed.intent).toBe('temporal');
      expect(parsed.dateRange).toBeDefined();
    });

    it('should detect today queries', () => {
      const parsed = processor.parseQuery('What changed today?');
      expect(parsed.intent).toBe('temporal');
      expect(parsed.dateRange).toBeDefined();
    });

    it('should detect this month queries', () => {
      const parsed = processor.parseQuery('What changed this month?');
      expect(parsed.intent).toBe('temporal');
      expect(parsed.dateRange).toBeDefined();
    });

    it('should detect last month queries', () => {
      const parsed = processor.parseQuery('What changed last month?');
      expect(parsed.intent).toBe('temporal');
      expect(parsed.dateRange).toBeDefined();
    });

    it('should handle custom day ranges', () => {
      const parsed = processor.parseQuery('What changed in the last 30 days?');
      expect(parsed.intent).toBe('temporal');
      expect(parsed.dateRange).toBeDefined();
    });
  });

  describe('Intent Detection', () => {
    it('should detect temporal intent', () => {
      expect(processor['detectIntent']('What changed last week?')).toBe('temporal');
      expect(processor['detectIntent']('What happened yesterday?')).toBe('temporal');
      expect(processor['detectIntent']('Changes this month')).toBe('temporal');
    });

    it('should detect decision intent', () => {
      expect(processor['detectIntent']('Why did we choose Clerk?')).toBe('decision');
      expect(processor['detectIntent']('What was the decision about authentication?')).toBe('decision');
      expect(processor['detectIntent']('Rationale for using TypeScript')).toBe('decision');
    });

    it('should detect explanation intent', () => {
      expect(processor['detectIntent']('How does authentication work?')).toBe('explanation');
      expect(processor['detectIntent']('Explain the database schema')).toBe('explanation');
      expect(processor['detectIntent']('How to set up the project?')).toBe('explanation');
    });

    it('should default to search intent', () => {
      expect(processor['detectIntent']('Find authentication code')).toBe('search');
      expect(processor['detectIntent']('Search for database config')).toBe('search');
    });
  });

  describe('Service Management', () => {
    it('should be disabled by default', () => {
      expect(processor.isEnabled()).toBe(false);
    });

    it('should enable service', () => {
      processor.enable();
      expect(processor.isEnabled()).toBe(true);
      processor.disable();
    });

    it('should disable service', () => {
      processor.disable();
      expect(processor.isEnabled()).toBe(false);
    });
  });
});

describe('createNLQueryProcessor', () => {
  it('should create a NLQueryProcessor instance', () => {
    const queryProcessor = createNLQueryProcessor();
    expect(queryProcessor).toBeInstanceOf(NLQueryProcessor);
  });

  it('should create with LLM config', () => {
    const queryProcessor = createNLQueryProcessor({ 
      useLLM: true,
      llmApiKey: 'test-key',
    });
    expect(queryProcessor).toBeInstanceOf(NLQueryProcessor);
  });
});

describe('QueryIntent type', () => {
  it('should have all expected intent types', () => {
    const temporal: QueryIntent = 'temporal';
    const search: QueryIntent = 'search';
    const decision: QueryIntent = 'decision';
    const explanation: QueryIntent = 'explanation';
    const status: QueryIntent = 'status';
    const unknown: QueryIntent = 'unknown';
    
    expect(temporal).toBe('temporal');
    expect(search).toBe('search');
    expect(decision).toBe('decision');
    expect(explanation).toBe('explanation');
    expect(status).toBe('status');
    expect(unknown).toBe('unknown');
  });
});
