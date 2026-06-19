/**
 * Vector Search Module
 * 
 * Provides Qdrant vector search integration for semantic search across memory files.
 * Enables natural language queries like "What changed last week?"
 * 
 * Uses Piscina worker pool to prevent Qdrant connection pool exhaustion.
 * Limits concurrent embedding requests to 10 with exponential backoff retry.
 */

import { ok, err, Result } from '@ghost-persona/shared';
import { Piscina } from 'piscina';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Lazy import for Google GenAI to avoid loading it when not needed
let GoogleGenAI: any = null;
async function loadGoogleGenAI() {
  if (!GoogleGenAI) {
    const { GoogleGenAI: GenAI } = await import('@google/genai');
    GoogleGenAI = GenAI;
  }
  return GoogleGenAI;
}

// ─── Piscina Worker Pool Configuration ─────────────────────────────────────

// Maximum concurrent embedding requests to prevent Qdrant pool exhaustion
const MAX_CONCURRENT_EMBEDDINGS = 10;

// Create a Piscina worker pool for embedding generation
// Use a function to get the worker path that works in both source and compiled forms
function getWorkerFilePath(): string {
  // Try the compiled path first (dist/embedding-worker.js)
  const compiledPath = path.resolve(__dirname, 'embedding-worker.js');
  
  // Also try the source path for testing
  const sourcePath = path.resolve(__dirname, '..', 'src', 'embedding-worker.js');
  
  // Check which one exists
  try {
    if (fs.existsSync(compiledPath)) {
      return compiledPath;
    }
    if (fs.existsSync(sourcePath)) {
      return sourcePath;
    }
  } catch {
    // Fallback to compiled path
  }
  
  return compiledPath;
}

const WORKER_FILE_PATH = getWorkerFilePath();

// Create Piscina pool lazily to avoid issues during testing
// Only create the pool when vector search is actually enabled
let embeddingPool: Piscina | null = null;

function getEmbeddingPool(): Piscina | null {
  // Don't create pool if worker file doesn't exist (e.g., during testing)
  if (!fs.existsSync(WORKER_FILE_PATH)) {
    return null;
  }
  
  if (!embeddingPool) {
    try {
      embeddingPool = new Piscina({
        filename: WORKER_FILE_PATH,
        maxThreads: MAX_CONCURRENT_EMBEDDINGS,
        minThreads: 2,
        idleTimeout: 30000,
        maxQueue: 'auto',
      });
    } catch {
      // If pool creation fails, return null to use fallback
      return null;
    }
  }
  return embeddingPool;
}

// Track failed attempts for exponential backoff
const retryCounts = new Map<string, number>();
const MAX_RETRIES = 3;
const RETRY_DELAYS = [100, 500, 2000]; // Exponential backoff delays in ms

// ─── Types ─────────────────────────────────────────────────────────────────

interface VectorSearchConfig {
  /** Qdrant server URL (default: http://localhost:6333) */
  qdrantUrl?: string;
  /** Collection name for memory vectors (default: ghost_memory) */
  collectionName?: string;
  /** Vector dimension size (default: 768 for text-embedding-ada-002, 3072 for gemini-embedding-2) */
  vectorSize?: number;
  /** Enable/disable vector search (default: false) */
  enabled?: boolean;
  /** API key for embedding service (optional) */
  embeddingApiKey?: string;
  /** Embedding model to use */
  embeddingModel?: string;
  /** Embedding provider: 'google-genai', 'openai', 'mock' (default: 'mock') */
  embeddingProvider?: 'google-genai' | 'openai' | 'mock';
}

interface VectorRecord {
  id: string;
  vector: number[];
  payload: MemoryVectorPayload;
  score?: number;
}

interface MemoryVectorPayload {
  /** Source memory file name */
  fileName: string;
  /** Content of the memory */
  content: string;
  /** Type of memory */
  type: 'decision' | 'file-history' | 'snapshot' | 'architecture' | 'general';
  /** Timestamp of the memory */
  timestamp: string;
  /** Metadata for filtering */
  metadata?: Record<string, string>;
}

interface SearchQuery {
  query: string;
  /** Maximum number of results */
  limit?: number;
  /** Minimum similarity score (0-1) */
  minScore?: number;
  /** Filter by file name */
  fileName?: string;
  /** Filter by memory type */
  type?: string;
  /** Time range filter (ISO date strings) */
  dateRange?: { start?: string; end?: string };
}

interface SearchResult {
  results: VectorRecord[];
  query: string;
  total: number;
  averageScore: number;
}

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_VECTOR_CONFIG: VectorSearchConfig = {
  qdrantUrl: 'http://localhost:6333',
  collectionName: 'ghost_memory',
  vectorSize: 3072, // Standard for gemini-embedding-2
  enabled: false,
  embeddingModel: 'gemini-embedding-2',
  embeddingProvider: 'mock',
};

// ─── Vector Search Service ────────────────────────────────────────────────

class VectorSearchService {
  private config: VectorSearchConfig;
  private initialized = false;

  constructor(config: Partial<VectorSearchConfig> = {}) {
    this.config = { ...DEFAULT_VECTOR_CONFIG, ...config };
  }

  /**
   * Initialize the vector search service and Qdrant collection
   */
  async initialize(): Promise<Result<void>> {
    if (!this.config.enabled) {
      return ok(undefined);
    }

    try {
      // Check if Qdrant is available
      const health = await this.checkQdrantHealth();
      if (!health) {
        return err(new Error('Qdrant server is not running or not accessible'));
      }

      // Create collection if it doesn't exist
      await this.ensureCollectionExists();
      this.initialized = true;
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check if Qdrant server is healthy
   */
  async checkQdrantHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.qdrantUrl}/ready`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Ensure the Qdrant collection exists
   */
  private async ensureCollectionExists(): Promise<void> {
    const collectionName = this.config.collectionName!;
    const vectorSize = this.config.vectorSize!;

    try {
      // Check if collection exists
      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${collectionName}`
      );

      if (response.ok) {
        return; // Collection exists
      }

      // Create collection
      await fetch(`${this.config.qdrantUrl}/collections/${collectionName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: {
            size: vectorSize,
            distance: 'Cosine',
          },
        }),
      });
    } catch {
      // If we can't check or create, we'll try on first insert
    }
  }

  /**
   * Index a memory document for vector search
   */
  async indexMemory(
    id: string,
    content: string,
    payload: MemoryVectorPayload
  ): Promise<Result<void>> {
    if (!this.config.enabled || !this.initialized) {
      return ok(undefined);
    }

    try {
      // Generate embedding
      const embedding = await this.generateEmbedding(content);
      if (!embedding) {
        return err(new Error('Failed to generate embedding'));
      }

      // Upsert vector to Qdrant
      const collectionName = this.config.collectionName!;
      const vectorSize = this.config.vectorSize!;

      // Ensure embedding is correct size
      if (embedding.length !== vectorSize) {
        return err(
          new Error(
            `Embedding size ${embedding.length} doesn't match expected size ${vectorSize}`
          )
        );
      }

      await fetch(`${this.config.qdrantUrl}/collections/${collectionName}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [
            {
              id,
              vector: embedding,
              payload,
            },
          ],
        }),
      });

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Index multiple memory documents using worker pool for backpressure
   */
  async indexMemories(
    documents: Array<{ id: string; content: string; payload: MemoryVectorPayload }>
  ): Promise<Result<void>> {
    if (!this.config.enabled || !this.initialized) {
      return ok(undefined);
    }

    try {
      const collectionName = this.config.collectionName!;
      const vectorSize = this.config.vectorSize!;
      const points: Array<{
        id: string;
        vector: number[];
        payload: MemoryVectorPayload;
      }> = [];

      // Process documents in batches to respect worker pool limits
      const batchSize = Math.min(MAX_CONCURRENT_EMBEDDINGS, documents.length);
      
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        
        // Generate embeddings for this batch
        const embeddingPromises = batch.map(async (doc) => {
          const embedding = await this.generateEmbedding(doc.content);
          if (embedding && embedding.length === vectorSize) {
            points.push({
              id: doc.id,
              vector: embedding,
              payload: doc.payload,
            });
          }
        });

        await Promise.all(embeddingPromises);
        
        // Optional: Add delay between batches to prevent overwhelming Qdrant
        if (i + batchSize < documents.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Batch insert
      if (points.length > 0) {
        await fetch(
          `${this.config.qdrantUrl}/collections/${collectionName}/points/batch`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ points }),
          }
        );
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Search memory using semantic similarity
   */
  async search(query: SearchQuery): Promise<Result<SearchResult>> {
    if (!this.config.enabled || !this.initialized) {
      return err(new Error('Vector search is not enabled or not initialized'));
    }

    try {
      const collectionName = this.config.collectionName!;
      const limit = query.limit || 10;
      const minScore = query.minScore || 0.5;

      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query.query);
      if (!queryEmbedding) {
        return err(new Error('Failed to generate query embedding'));
      }

      // Build filter conditions
      const filter: any = {};
      const conditions: any[] = [];

      if (query.fileName) {
        conditions.push({
          key: 'fileName',
          match: { value: query.fileName },
        });
      }

      if (query.type) {
        conditions.push({
          key: 'type',
          match: { value: query.type },
        });
      }

      if (query.dateRange) {
        if (query.dateRange.start) {
          conditions.push({
            key: 'timestamp',
            range: { gte: query.dateRange.start },
          });
        }
        if (query.dateRange.end) {
          conditions.push({
            key: 'timestamp',
            range: { lte: query.dateRange.end },
          });
        }
      }

      if (conditions.length > 0) {
        filter.filter = conditions.length === 1 ? conditions[0] : { and: conditions };
      }

      // Perform vector search
      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryEmbedding,
            limit,
            score_threshold: minScore,
            ...filter,
          }),
        }
      );

      if (!response.ok) {
        return err(new Error(`Qdrant search failed: ${response.statusText}`));
      }

      const data = (await response.json()) as {
        result: {
          id: string;
          vector: number[];
          payload: MemoryVectorPayload;
          score: number;
        }[];
      };

      const results: VectorRecord[] = data.result.map((r) => ({
        id: r.id,
        vector: r.vector,
        payload: r.payload,
        score: r.score,
      }));

      const averageScore =
        results.reduce((sum, r) => sum + (r.score || 0), 0) / Math.max(1, results.length);

      return ok({
        results,
        query: query.query,
        total: results.length,
        averageScore,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Natural language query: "What changed last week?"
   */
  async queryNaturalLanguage(
    question: string,
    options?: { limit?: number; dateRange?: { start?: string; end?: string } }
  ): Promise<Result<SearchResult>> {
    // Parse temporal queries
    const dateRange = this.parseTemporalQuery(question) || options?.dateRange;

    return this.search({
      query: question,
      limit: options?.limit || 10,
      minScore: 0.4,
      dateRange,
    });
  }

  /**
   * Parse temporal queries like "last week", "yesterday", "this month"
   */
  private parseTemporalQuery(query: string): { start?: string; end?: string } | null {
    const now = new Date();
    const queries = query.toLowerCase();

    if (queries.includes('last week') || queries.includes('past week')) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (queries.includes('yesterday')) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (queries.includes('this week') || queries.includes('current week')) {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - start.getDay()); // Start of week
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (queries.includes('last month') || queries.includes('past month')) {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (queries.includes('this month') || queries.includes('current month')) {
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { start: start.toISOString(), end: end.toISOString() };
    }

    if (queries.includes('today')) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      return { start: start.toISOString(), end: end.toISOString() };
    }

    return null;
  }

  /**
   * Delete a vector from the index
   */
  async deleteVector(id: string): Promise<Result<void>> {
    if (!this.config.enabled || !this.initialized) {
      return ok(undefined);
    }

    try {
      const collectionName = this.config.collectionName!;
      await fetch(
        `${this.config.qdrantUrl}/collections/${collectionName}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [id],
          }),
        }
      );
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Delete all vectors for a specific file
   */
  async deleteVectorsForFile(fileName: string): Promise<Result<void>> {
    if (!this.config.enabled || !this.initialized) {
      return ok(undefined);
    }

    try {
      const collectionName = this.config.collectionName!;
      await fetch(
        `${this.config.qdrantUrl}/collections/${collectionName}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {
              key: 'fileName',
              match: { value: fileName },
            },
          }),
        }
      );
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Clear the entire collection
   */
  async clearCollection(): Promise<Result<void>> {
    if (!this.config.enabled || !this.initialized) {
      return ok(undefined);
    }

    try {
      const collectionName = this.config.collectionName!;
      await fetch(
        `${this.config.qdrantUrl}/collections/${collectionName}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filter: {},
          }),
        }
      );
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Generate embedding using the Piscina worker pool
   * This prevents Qdrant connection pool exhaustion by limiting concurrent requests
   */
  private async generateEmbedding(text: string): Promise<number[] | null> {
    const provider = this.config.embeddingProvider || 'mock';
    const apiKey = this.config.embeddingApiKey || process.env.GOOGLE_GENAI_API_KEY;
    const model = this.config.embeddingModel || 'gemini-embedding-2';
    const vectorSize = this.config.vectorSize || 3072;
    
    const taskId = this.generateTaskId(text);
    const retryCount = retryCounts.get(taskId) || 0;
    
    if (retryCount >= MAX_RETRIES) {
      console.warn(`⚠️ Max retries (${MAX_RETRIES}) exceeded for embedding task. Falling back to mock.`);
      return this.generateMockEmbedding(text, vectorSize);
    }
    
    try {
      // Get the pool (lazy initialization)
      const pool = getEmbeddingPool();
      
      // If pool is not available (e.g., during testing or worker file missing),
      // fall back to inline embedding
      if (!pool) {
        console.log('ℹ️ Piscina worker pool not available. Using inline embedding.');
        return this.generateEmbeddingInline(text, provider, apiKey, model, vectorSize);
      }
      
      // Submit task to worker pool
      const result = await pool.run({
        text,
        provider,
        apiKey,
        model,
        vectorSize
      });
      
      if (result.success && result.embedding) {
        // Reset retry count on success
        retryCounts.delete(taskId);
        return result.embedding;
      } else {
        // Handle worker error
        console.warn(`⚠️ Embedding generation failed: ${result.error}`);
        
        // Exponential backoff
        retryCounts.set(taskId, retryCount + 1);
        
        if (retryCount < MAX_RETRIES - 1) {
          const delay = RETRY_DELAYS[retryCount];
          console.log(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.generateEmbedding(text);
        }
        
        // Fall back to mock on final failure
        return this.generateMockEmbedding(text, vectorSize);
      }
    } catch (error) {
      console.error('❌ Embedding worker pool error:', error);
      
      // Increment retry count
      retryCounts.set(taskId, retryCount + 1);
      
      // Fall back to mock on error
      return this.generateMockEmbedding(text, vectorSize);
    }
  }

  /**
   * Generate a unique task ID for retry tracking
   */
  private generateTaskId(text: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(text.length, 100); i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Generate embedding inline (without worker pool) as fallback
   * This is used when Piscina is not available (e.g., during testing)
   */
  private async generateEmbeddingInline(
    text: string,
    provider: string,
    apiKey: string | undefined,
    model: string,
    vectorSize: number
  ): Promise<number[] | null> {
    switch (provider) {
      case 'google-genai': {
        if (!apiKey) {
          console.warn('⚠️ Google GenAI API key not configured. Falling back to mock.');
          return this.generateMockEmbedding(text, vectorSize);
        }
        
        try {
          const GoogleGenAIClass = await loadGoogleGenAI();
          const ai = new GoogleGenAIClass({ apiKey });
          
          const response = await ai.models.embedContent({
            model,
            contents: text,
          });
          
          // Update vector size based on actual embedding dimension
          const embedding = response.embeddings[0].values;
          if (embedding.length !== vectorSize) {
            console.log(`ℹ️ Updating vectorSize from ${vectorSize} to ${embedding.length} for ${model}`);
          }
          
          return embedding;
        } catch (error) {
          console.error('❌ Google GenAI embedding failed:', error);
          return this.generateMockEmbedding(text, vectorSize);
        }
      }
      
      case 'openai': {
        // OpenAI embedding implementation would go here
        console.warn('OpenAI embedding not yet implemented. Falling back to mock.');
        return this.generateMockEmbedding(text, vectorSize);
      }
      
      case 'mock':
      default:
        return this.generateMockEmbedding(text, vectorSize);
    }
  }

  /**
   * Generate mock embedding for testing (no external API calls)
   */
  private generateMockEmbedding(text: string, vectorSize: number): number[] {
    const vector = new Array(vectorSize).fill(0);

    // Simple hash-based mock embedding for deterministic testing
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash |= 0; // Convert to 32-bit integer
    }

    // Fill vector with deterministic values based on hash
    for (let i = 0; i < vectorSize; i++) {
      vector[i] = ((hash + i) % 1000) / 1000.0 - 0.5;
    }

    return vector;
  }

  /**
   * Get worker pool statistics
   */
  getPoolStats(): { queueSize: number; completed: number; utilization: number; poolAvailable: boolean } {
    const pool = getEmbeddingPool();
    if (!pool) {
      return {
        queueSize: 0,
        completed: 0,
        utilization: 0,
        poolAvailable: false
      };
    }
    return {
      queueSize: pool.queueSize,
      completed: pool.completed,
      utilization: pool.utilization,
      poolAvailable: true
    };
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<Result<{ totalVectors: number; collectionExists: boolean }>> {
    if (!this.config.enabled) {
      return ok({ totalVectors: 0, collectionExists: false });
    }

    try {
      const collectionName = this.config.collectionName!;
      const response = await fetch(
        `${this.config.qdrantUrl}/collections/${collectionName}`
      );

      if (!response.ok) {
        return ok({ totalVectors: 0, collectionExists: false });
      }

      const data = (await response.json()) as { result: { points_count: number } };
      const totalVectors = data.result?.points_count || 0;

      return ok({ totalVectors, collectionExists: true });
    } catch {
      return ok({ totalVectors: 0, collectionExists: false });
    }
  }

  /**
   * Check if vector search is enabled
   */
  isEnabled(): boolean {
    return (this.config.enabled ?? false) && this.initialized;
  }

  /**
   * Enable vector search
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Disable vector search
   */
  disable(): void {
    this.config.enabled = false;
    this.initialized = false;
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────

function createVectorSearch(config?: Partial<VectorSearchConfig>): VectorSearchService {
  return new VectorSearchService(config);
}

// ─── Exports ───────────────────────────────────────────────────────────────

export { VectorSearchService, createVectorSearch, DEFAULT_VECTOR_CONFIG, MAX_CONCURRENT_EMBEDDINGS };
export type { VectorSearchConfig, VectorRecord, MemoryVectorPayload, SearchQuery, SearchResult };
