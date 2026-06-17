/**
 * Semantic Search Module
 * 
 * Provides semantic similarity search across memory files.
 * Uses vector embeddings to find semantically similar content,
 * not just keyword matches.
 */

import { ok, err, Result } from '@ghost-persona/shared';
import {
  VectorSearchService,
  VectorSearchConfig,
  SearchQuery,
  SearchResult,
  MemoryVectorPayload,
} from '@ghost-persona/vector-search';
import fs from 'fs/promises';
import path from 'path';

// ─── Types ─────────────────────────────────────────────────────────────────

interface SemanticSearchConfig extends VectorSearchConfig {
  /** Directory containing memory files */
  ghostDir?: string;
  /** Files to index for semantic search */
  memoryFiles?: string[];
  /** Auto-index on startup */
  autoIndex?: boolean;
}

interface MemoryFileContent {
  fileName: string;
  content: string;
  type: 'decision' | 'file-history' | 'snapshot' | 'architecture' | 'general';
  timestamp: string;
}

interface SemanticSearchResult {
  results: Array<{
    fileName: string;
    content: string;
    type: string;
    timestamp: string;
    score: number;
    id: string;
  }>;
  query: string;
  total: number;
  averageScore?: number;
}

// ─── Default Configuration ─────────────────────────────────────────────────

const DEFAULT_SEMANTIC_CONFIG: SemanticSearchConfig = {
  ...{
    qdrantUrl: 'http://localhost:6333',
    collectionName: 'ghost_memory',
    vectorSize: 768,
    enabled: false,
    embeddingModel: 'text-embedding-ada-002',
  },
  memoryFiles: [
    'project.md',
    'architecture.md',
    'decisions.md',
    'roadmap.md',
    'current-work.md',
    'file-history.md',
    'developer-persona.md',
  ],
  autoIndex: true,
};

// ─── Semantic Search Service ────────────────────────────────────────────────

class SemanticSearchService {
  private vectorSearch: VectorSearchService;
  private config: SemanticSearchConfig;
  private indexedFiles: Set<string> = new Set();

  constructor(config: Partial<SemanticSearchConfig> = {}) {
    this.config = { ...DEFAULT_SEMANTIC_CONFIG, ...config };
    this.vectorSearch = new VectorSearchService(config);
  }

  /**
   * Initialize the semantic search service
   */
  async initialize(): Promise<Result<void>> {
    const result = await this.vectorSearch.initialize();
    if (!result.success && (this.config.enabled ?? false)) {
      return result;
    }

    // Auto-index memory files if enabled
    if ((this.config.enabled ?? false) && this.config.autoIndex && this.config.ghostDir) {
      await this.indexAllMemoryFiles();
    }

    return ok(undefined);
  }

  /**
   * Index all memory files in the ghost directory
   */
  async indexAllMemoryFiles(): Promise<Result<void>> {
    if (!this.config.ghostDir) {
      return ok(undefined);
    }

    try {
      const files = this.config.memoryFiles || DEFAULT_SEMANTIC_CONFIG.memoryFiles || [];
      
      for (const fileName of files) {
        const filePath = path.join(this.config.ghostDir, fileName);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const type = this.getFileType(fileName);
          const timestamp = new Date().toISOString();

          // Split content into chunks for better embedding
          const chunks = this.splitContentIntoChunks(content, fileName);

          // Index each chunk
          const documents = chunks.map((chunk, index) => ({
            id: `${fileName}-${index}`,
            content: chunk,
            payload: {
              fileName,
              content: chunk,
              type,
              timestamp,
              metadata: {
                chunkIndex: String(index),
                totalChunks: String(chunks.length),
              },
            },
          }));

          await this.vectorSearch.indexMemories(documents);
          this.indexedFiles.add(fileName);
        } catch {
          // File doesn't exist or can't be read
          continue;
        }
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Index a specific memory file
   */
  async indexMemoryFile(fileName: string, content: string): Promise<Result<void>> {
    const type = this.getFileType(fileName);
    const timestamp = new Date().toISOString();

    // Split content into chunks
    const chunks = this.splitContentIntoChunks(content, fileName);

    // Index each chunk
    const documents = chunks.map((chunk, index) => ({
      id: `${fileName}-${index}`,
      content: chunk,
      payload: {
        fileName,
        content: chunk,
        type,
        timestamp,
        metadata: {
          chunkIndex: String(index),
          totalChunks: String(chunks.length),
        },
      },
    }));

    return this.vectorSearch.indexMemories(documents);
  }

  /**
   * Search across all indexed memory files
   */
  async search(query: string, options?: {
    limit?: number;
    minScore?: number;
    fileName?: string;
    type?: string;
  }): Promise<Result<SemanticSearchResult>> {
    const result = await this.vectorSearch.search({
      query,
      limit: options?.limit || 10,
      minScore: options?.minScore || 0.5,
      fileName: options?.fileName,
      type: options?.type,
    });

    if (!result.success) {
      return result as Result<SemanticSearchResult>;
    }

    // Transform results to semantic search format
    const semanticResults: SemanticSearchResult = {
      query,
      total: result.data.total,
      results: result.data.results.map((r: { payload: MemoryVectorPayload; score?: number; id: string }) => ({
        fileName: r.payload.fileName,
        content: r.payload.content,
        type: r.payload.type,
        timestamp: r.payload.timestamp,
        score: r.score || 0,
        id: r.id,
      })),
    };

    return ok(semanticResults);
  }

  /**
   * Natural language query: "What changed last week?"
   */
  async queryNaturalLanguage(
    question: string,
    options?: { limit?: number; dateRange?: { start?: string; end?: string } }
  ): Promise<Result<SemanticSearchResult>> {
    const result = await this.vectorSearch.queryNaturalLanguage(question, options);

    if (!result.success) {
      return result as Result<SemanticSearchResult>;
    }

    const semanticResults: SemanticSearchResult = {
      query: question,
      total: result.data.total,
      results: result.data.results.map((r: { payload: MemoryVectorPayload; score?: number; id: string }) => ({
        fileName: r.payload.fileName,
        content: r.payload.content,
        type: r.payload.type,
        timestamp: r.payload.timestamp,
        score: r.score || 0,
        id: r.id,
      })),
    };

    return ok(semanticResults);
  }

  /**
   * Find similar memories across all files
   */
  async findSimilar(
    content: string,
    options?: { limit?: number; minScore?: number }
  ): Promise<Result<SemanticSearchResult>> {
    return this.search(content, {
      limit: options?.limit || 10,
      minScore: options?.minScore || 0.6,
    });
  }

  /**
   * Find similar decisions
   */
  async findSimilarDecisions(
    query: string,
    options?: { limit?: number; minScore?: number }
  ): Promise<Result<SemanticSearchResult>> {
    return this.search(query, {
      ...options,
      type: 'decision',
      minScore: options?.minScore || 0.6,
    });
  }

  /**
   * Find similar file history entries
   */
  async findSimilarFileHistory(
    query: string,
    options?: { limit?: number; minScore?: number }
  ): Promise<Result<SemanticSearchResult>> {
    return this.search(query, {
      ...options,
      type: 'file-history',
      minScore: options?.minScore || 0.6,
    });
  }

  /**
   * Re-index a specific file
   */
  async reindexFile(fileName: string): Promise<Result<void>> {
    if (!this.config.ghostDir) {
      return err(new Error('ghostDir not configured'));
    }

    // First, delete old vectors for this file
    await this.vectorSearch.deleteVectorsForFile(fileName);

    // Then re-index
    const filePath = path.join(this.config.ghostDir, fileName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.indexMemoryFile(fileName, content);
    } catch {
      return err(new Error(`File ${fileName} not found`));
    }
  }

  /**
   * Re-index all memory files
   */
  async reindexAll(): Promise<Result<void>> {
    // Clear the collection
    await this.vectorSearch.clearCollection();
    this.indexedFiles.clear();

    // Re-index all
    return this.indexAllMemoryFiles();
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<Result<{
    totalVectors: number;
    indexedFiles: string[];
    collectionExists: boolean;
  }>> {
    const vectorStats = await this.vectorSearch.getStats();
    return ok({
      totalVectors: vectorStats.success ? vectorStats.data.totalVectors : 0,
      indexedFiles: Array.from(this.indexedFiles),
      collectionExists: vectorStats.success ? vectorStats.data.collectionExists : false,
    });
  }

  /**
   * Check if semantic search is enabled
   */
  isEnabled(): boolean {
    return this.vectorSearch.isEnabled();
  }

  /**
   * Enable semantic search
   */
  enable(): void {
    this.vectorSearch.enable();
  }

  /**
   * Disable semantic search
   */
  disable(): void {
    this.vectorSearch.disable();
  }

  /**
   * Get file type based on filename
   */
  private getFileType(fileName: string): MemoryVectorPayload['type'] {
    const name = fileName.toLowerCase();
    if (name.includes('decision')) return 'decision';
    if (name.includes('file-history')) return 'file-history';
    if (name.includes('snapshot')) return 'snapshot';
    if (name.includes('architecture')) return 'architecture';
    return 'general';
  }

  /**
   * Split content into chunks for embedding
   * This helps with large files and improves search quality
   */
  private splitContentIntoChunks(content: string, fileName: string): string[] {
    const MAX_CHUNK_SIZE = 2000; // Maximum characters per chunk
    const MIN_CHUNK_SIZE = 200; // Minimum characters per chunk
    const OVERLAP = 200; // Character overlap between chunks

    // For small files, just return the whole content
    if (content.length <= MAX_CHUNK_SIZE) {
      return [content];
    }

    // For large files, split into chunks
    const chunks: string[] = [];
    let start = 0;

    while (start < content.length) {
      let end = Math.min(start + MAX_CHUNK_SIZE, content.length);

      // Try to split at paragraph boundaries
      const lastNewline = content.lastIndexOf('\n', end);
      const lastPeriod = content.lastIndexOf('.', end);
      const lastBreak = Math.max(lastNewline, lastPeriod);

      if (lastBreak > start + MIN_CHUNK_SIZE) {
        end = lastBreak + 1;
      }

      const chunk = content.slice(start, end);

      // Ensure chunk is not too small
      if (chunk.length >= MIN_CHUNK_SIZE || end >= content.length) {
        chunks.push(chunk);
        start = Math.max(end - OVERLAP, start + MIN_CHUNK_SIZE);
      } else {
        // Merge with next chunk
        start = end;
      }
    }

    return chunks;
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────

function createSemanticSearch(config?: Partial<SemanticSearchConfig>): SemanticSearchService {
  return new SemanticSearchService(config);
}

// ─── Exports ───────────────────────────────────────────────────────────────

export { SemanticSearchService, createSemanticSearch, DEFAULT_SEMANTIC_CONFIG };
export type { SemanticSearchConfig, MemoryFileContent, SemanticSearchResult };
