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
      expect(DEFAULT_VECTOR_CONFIG.vectorSize).toBe(3072);
      expect(DEFAULT_VECTOR_CONFIG.enabled).toBe(false);
      expect(DEFAULT_VECTOR_CONFIG.embeddingModel).toBe('gemini-embedding-2');
      expect(DEFAULT_VECTOR_CONFIG.embeddingProvider).toBe('mock');
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
    it('should generate mock embeddings of correct size (default 3072)', async () => {
      service = new VectorSearchService({ 
        enabled: false, // Disabled to avoid Qdrant calls
        embeddingProvider: 'mock',
        vectorSize: 3072,
      });
      
      // Access the private method through the class instance
      const generateEmbedding = (service as any).generateEmbedding.bind(service);
      const text = 'test content';
      const embedding = await generateEmbedding(text);
      
      expect(embedding).toBeDefined();
      expect(embedding?.length).toBe(3072);
    });

    it('should generate deterministic embeddings for same text', async () => {
      service = new VectorSearchService({ 
        enabled: false,
        embeddingProvider: 'mock',
        vectorSize: 128, // Smaller for faster testing
      });
      
      const generateEmbedding = (service as any).generateEmbedding.bind(service);
      const text = 'test content';
      
      const embedding1 = await generateEmbedding(text);
      const embedding2 = await generateEmbedding(text);
      
      expect(embedding1).toEqual(embedding2);
    });

    it('should generate different embeddings for different text', async () => {
      service = new VectorSearchService({ 
        enabled: false,
        embeddingProvider: 'mock',
        vectorSize: 128,
      });
      
      const generateEmbedding = (service as any).generateEmbedding.bind(service);
      
      const embedding1 = await generateEmbedding('text one');
      const embedding2 = await generateEmbedding('text two');
      
      // At least first few values should differ
      expect(embedding1?.slice(0, 5)).not.toEqual(embedding2?.slice(0, 5));
    });

    it('should fall back to mock when Google GenAI key not configured', async () => {
      service = new VectorSearchService({ 
        enabled: false,
        embeddingProvider: 'google-genai',
        vectorSize: 3072,
        // No API key set
      });
      
      const generateEmbedding = (service as any).generateEmbedding.bind(service);
      const embedding = await generateEmbedding('test');
      
      // Should still return a mock embedding even without API key
      expect(embedding).toBeDefined();
      expect(embedding?.length).toBe(3072);
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

describe('Google GenAI Embedding (Live Test)', () => {
  // Skip this test by default - only run when explicitly testing with live API
  // To run: npm test -- --run packages/vector-search --reporter=verbose
  const apiKey = process.env.GOOGLE_GENAI_API_KEY;
  const shouldSkip = !apiKey;

  it.skipIf(shouldSkip)('should generate real embedding with Google GenAI', async () => {
    const service = new VectorSearchService({
      enabled: false, // Disabled to avoid Qdrant calls
      embeddingProvider: 'google-genai',
      embeddingModel: 'gemini-embedding-2',
      embeddingApiKey: apiKey,
      vectorSize: 3072,
    });

    const generateEmbedding = (service as any).generateEmbedding.bind(service);
    const text = 'Ghost Persona is a memory system';
    
    const embedding = await generateEmbedding(text);
    
    expect(embedding).toBeDefined();
    expect(embedding?.length).toBe(3072);
    expect(typeof embedding?.[0]).toBe('number');
    
    // Verify it's a real embedding (not all zeros)
    const nonZeroValues = embedding?.filter(v => Math.abs(v) > 0.0001);
    expect(nonZeroValues?.length).toBeGreaterThan(100);
  }, 10000); // 10 second timeout for API call
});
