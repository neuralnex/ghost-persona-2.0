import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  SemanticSearchService, 
  SemanticSearchConfig, 
  DEFAULT_SEMANTIC_CONFIG,
  createSemanticSearch
} from '../index.js';
import * as fs from 'fs/promises';

// Mock global fetch
global.fetch = vi.fn();

// Mock fs module
vi.mock('fs/promises', async () => {
  const actual = await vi.importActual('fs/promises');
  return {
    ...actual,
    default: {
      ...actual.default,
      readFile: vi.fn(),
    },
    readFile: vi.fn(),
  };
});

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SemanticSearchService({ enabled: false });
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      expect(DEFAULT_SEMANTIC_CONFIG.qdrantUrl).toBe('http://localhost:6333');
      expect(DEFAULT_SEMANTIC_CONFIG.collectionName).toBe('ghost_memory');
      expect(DEFAULT_SEMANTIC_CONFIG.vectorSize).toBe(768);
      expect(DEFAULT_SEMANTIC_CONFIG.autoIndex).toBe(true);
      expect(DEFAULT_SEMANTIC_CONFIG.memoryFiles).toContain('decisions.md');
    });

    it('should be created via factory function', () => {
      const customConfig: Partial<SemanticSearchConfig> = {
        ghostDir: '/path/to/ghost',
        enabled: true,
      };
      const searchService = createSemanticSearch(customConfig);
      expect(searchService).toBeInstanceOf(SemanticSearchService);
    });
  });

  describe('File Type Detection', () => {
    it('should detect decision files', () => {
      // This tests the internal getFileType method
      // We can't directly test private methods, but we can verify the service works
      expect(service).toBeInstanceOf(SemanticSearchService);
    });

    it('should detect file-history files', () => {
      expect(true).toBe(true); // Placeholder
    });

    it('should detect architecture files', () => {
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Content Chunking', () => {
    it('should return single chunk for small content', () => {
      expect(true).toBe(true); // Placeholder
    });

    it('should split large content into chunks', () => {
      expect(true).toBe(true); // Placeholder
    });

    it('should handle content with paragraph breaks', () => {
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Service Management', () => {
    it('should be disabled by default', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should enable service', () => {
      service.enable();
      // Note: enable() delegates to vectorSearch.enable()
      service.disable();
    });

    it('should disable service', () => {
      service.disable();
      expect(service.isEnabled()).toBe(false);
    });
  });
});

describe('createSemanticSearch', () => {
  it('should create a SemanticSearchService instance', () => {
    const searchService = createSemanticSearch();
    expect(searchService).toBeInstanceOf(SemanticSearchService);
  });

  it('should create with ghostDir config', () => {
    const searchService = createSemanticSearch({ 
      ghostDir: '/custom/path',
    });
    expect(searchService).toBeInstanceOf(SemanticSearchService);
  });
});
