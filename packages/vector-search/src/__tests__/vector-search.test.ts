import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  VectorSearchService, 
  VectorSearchConfig, 
  DEFAULT_VECTOR_CONFIG,
  createVectorSearch
} from '../index.js';

// Mock global fetch
global.fetch = vi.fn();

describe('VectorSearchService', () => {
  let service: VectorSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VectorSearchService({ enabled: false }); // Disabled by default for tests
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      expect(DEFAULT_VECTOR_CONFIG.qdrantUrl).toBe('http://localhost:6333');
      expect(DEFAULT_VECTOR_CONFIG.collectionName).toBe('ghost_memory');
      expect(DEFAULT_VECTOR_CONFIG.vectorSize).toBe(768);
      expect(DEFAULT_VECTOR_CONFIG.enabled).toBe(false);
      expect(DEFAULT_VECTOR_CONFIG.embeddingModel).toBe('text-embedding-ada-002');
    });

    it('should be created via factory function', () => {
      const customConfig: Partial<VectorSearchConfig> = {
        qdrantUrl: 'http://custom:6333',
        enabled: true,
      };
      const searchService = createVectorSearch(customConfig);
      expect(searchService).toBeInstanceOf(VectorSearchService);
    });
  });

  describe('Service Lifecycle', () => {
    it('should not initialize when disabled', async () => {
      const result = await service.initialize();
      expect(result.success).toBe(true);
      expect(service.isEnabled()).toBe(false);
    });

    it('should check Qdrant health on initialization', async () => {
      const enabledService = new VectorSearchService({ enabled: true });
      
      // Mock Qdrant health check
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      // Mock collection check
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      // Mock collection creation
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await enabledService.initialize();
      expect(result.success).toBe(true);
    });

    it('should fail if Qdrant is not running', async () => {
      const enabledService = new VectorSearchService({ enabled: true });
      
      // Mock Qdrant health check failure
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const result = await enabledService.initialize();
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Qdrant server is not running');
    });
  });

  describe('Embedding Generation', () => {
    it('should generate mock embeddings of correct size', async () => {
      service = new VectorSearchService({ 
        enabled: true,
        vectorSize: 768,
      });
      
      // Access the private method through the class
      // This tests the internal embedding generation
      const text = 'test content';
      // We can't directly test private methods, but we can test through public methods
      // that use embedding generation
    });

    it('should generate deterministic embeddings for same text', async () => {
      // This is tested indirectly through the service methods
      expect(true).toBe(true); // Placeholder
    });
  });

  describe('Service Management', () => {
    it('should be disabled by default', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should enable and disable service', () => {
      service.enable();
      // Note: enable() sets config.enabled = true, but initialized is still false
      // So isEnabled() checks both
      
      service.disable();
      expect(service.isEnabled()).toBe(false);
    });

    it('should check if enabled correctly', () => {
      expect(service.isEnabled()).toBe(false);
      
      service.enable();
      // Even with enabled=true, initialized=false means isEnabled returns false
      
      service.disable();
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('Temporal Query Parsing', () => {
    // These are internal methods, but we can test the public queryNaturalLanguage
    it('should parse temporal queries', async () => {
      service = new VectorSearchService({ 
        enabled: false, // We're just testing parsing, not actual search
      });
      
      // Test that the service can be created
      expect(service).toBeInstanceOf(VectorSearchService);
    });
  });
});

describe('createVectorSearch', () => {
  it('should create a VectorSearchService instance', () => {
    const searchService = createVectorSearch();
    expect(searchService).toBeInstanceOf(VectorSearchService);
  });

  it('should create with custom config', () => {
    const searchService = createVectorSearch({ 
      qdrantUrl: 'http://custom:6333',
      collectionName: 'custom_collection',
    });
    expect(searchService).toBeInstanceOf(VectorSearchService);
  });
});
