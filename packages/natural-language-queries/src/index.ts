/**
 * Natural Language Queries Module
 * 
 * Processes natural language queries like "What changed last week?" 
 * and converts them to structured search queries.
 */

import { ok, err, Result } from '@ghost-persona/shared';
import {
  SemanticSearchService,
  SemanticSearchConfig,
  SemanticSearchResult,
} from '@ghost-persona/semantic-search';

// ─── Types ─────────────────────────────────────────────────────────────────

interface NLQueryConfig extends SemanticSearchConfig {
  /** Enable LLM-powered query understanding (requires API key) */
  useLLM?: boolean;
  /** LLM API key for query understanding */
  llmApiKey?: string;
  /** LLM model for query understanding */
  llmModel?: string;
}

interface ParsedQuery {
  /** The original query */
  query: string;
  /** Intent type */
  intent: QueryIntent;
  /** Time range if applicable */
  dateRange?: { start: string; end: string };
  /** File types to search */
  fileTypes?: string[];
  /** Memory types to search */
  memoryTypes?: string[];
  /** Specific keywords */
  keywords?: string[];
}

type QueryIntent =
  | 'temporal' // "What changed last week?"
  | 'search' // "Find authentication code"
  | 'decision' // "Why did we choose Clerk?"
  | 'explanation' // "How does authentication work?"
  | 'status' // "What is the current status?"
  | 'unknown';

interface NLQueryResult {
  parsed: ParsedQuery;
  searchResult?: SemanticSearchResult;
}

// ─── Temporal Query Patterns ───────────────────────────────────────────────

const TEMPORAL_PATTERNS: Array<{
  pattern: RegExp;
  calculateRange: (match: RegExpMatchArray) => { start: string; end: string };
}> = [
  {
    pattern: /last\s+week|past\s+week|previous\s+week/i,
    calculateRange: (_match: RegExpMatchArray) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /yesterday/i,
    calculateRange: (_match: RegExpMatchArray) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 1);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /this\s+week|current\s+week/i,
    calculateRange: (_match: RegExpMatchArray) => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - start.getDay());
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /last\s+month|past\s+month|previous\s+month/i,
    calculateRange: (_match: RegExpMatchArray) => {
      const end = new Date();
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /this\s+month|current\s+month/i,
    calculateRange: (_match: RegExpMatchArray) => {
      const end = new Date();
      const start = new Date(end.getFullYear(), end.getMonth(), 1);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /today/i,
    calculateRange: (_match: RegExpMatchArray) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /in\s+the\s+last\s+(\d+)\s+days/i,
    calculateRange: (match: RegExpMatchArray) => {
      const days = parseInt(match[1]) || 7;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      return { start: start.toISOString(), end: end.toISOString() };
    },
  },
  {
    pattern: /(\d{4})-(\d{2})-(\d{2})/,
    calculateRange: (match: RegExpMatchArray) => {
      const date = new Date(`${match[1]}-${match[2]}-${match[3]}`);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      return { start: date.toISOString(), end: end.toISOString() };
    },
  },
];

const DECISION_PATTERNS: RegExp[] = [
  /why\s+(did|we|you|they)\s+choose/i,
  /why\s+(was|is|were|are)\s+.*\s+chosen/i,
  /what\s+(was|is)\s+the\s+decision\s+(about|on|regarding)/i,
  /decision\s+(about|on|regarding)/i,
  /rational(e|le)\s+for/i,
];

const EXPLANATION_PATTERNS: RegExp[] = [
  /how\s+(does|do|did)\s+/i,
  /explain\s+/i,
  /what\s+(is|are)\s+the\s+steps\s+(for|to)/i,
  /how\s+to\s+/i,
];

// ─── Natural Language Query Processor ───────────────────────────────────────

class NLQueryProcessor {
  private semanticSearch: SemanticSearchService;
  private config: NLQueryConfig;

  constructor(config: Partial<NLQueryConfig> = {}) {
    this.config = { ...{ useLLM: false }, ...config };
    this.semanticSearch = new SemanticSearchService(config);
  }

  /**
   * Process a natural language query
   */
  async process(query: string): Promise<Result<NLQueryResult>> {
    // Parse the query
    const parsed = this.parseQuery(query);

    // Execute the search
    const searchResult = await this.executeQuery(parsed);

    return ok({
      parsed,
      searchResult,
    });
  }

  /**
   * Parse a natural language query into structured format
   */
  parseQuery(query: string): ParsedQuery {
    const lowerQuery = query.toLowerCase();
    const intent = this.detectIntent(query);
    let dateRange: { start: string; end: string } | undefined;
    let fileTypes: string[] | undefined;
    let memoryTypes: string[] | undefined;
    let keywords: string[] | undefined;

    // Extract temporal range
    for (const pattern of TEMPORAL_PATTERNS) {
      const match = query.match(pattern.pattern);
      if (match) {
        dateRange = pattern.calculateRange(match);
        break;
      }
    }

    // Extract file types
    if (lowerQuery.includes('authentication') || lowerQuery.includes('auth')) {
      fileTypes = ['decisions.md', 'file-history.md', 'architecture.md'];
    }

    if (lowerQuery.includes('database') || lowerQuery.includes('db')) {
      fileTypes = ['architecture.md', 'decisions.md', 'file-history.md'];
    }

    // Extract memory types
    if (intent === 'decision') {
      memoryTypes = ['decision'];
    }

    // Extract keywords
    const words = query.toLowerCase().split(/\s+/);
    keywords = words.filter(
      (w) => !['what', 'when', 'where', 'why', 'how', 'is', 'the', 'a', 'an', 'in', 'on', 'at', 'to'].includes(w)
    );

    return {
      query,
      intent,
      dateRange,
      fileTypes,
      memoryTypes,
      keywords,
    };
  }

  /**
   * Detect the intent of a query
   */
  private detectIntent(query: string): QueryIntent {
    const lowerQuery = query.toLowerCase();

    // Check temporal patterns
    for (const pattern of TEMPORAL_PATTERNS) {
      if (pattern.pattern.test(query)) {
        return 'temporal';
      }
    }

    // Check decision patterns
    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(lowerQuery)) {
        return 'decision';
      }
    }

    // Check explanation patterns
    for (const pattern of EXPLANATION_PATTERNS) {
      if (pattern.test(lowerQuery)) {
        return 'explanation';
      }
    }

    // Default to search
    return 'search';
  }

  /**
   * Execute a parsed query
   */
  private async executeQuery(parsed: ParsedQuery): Promise<SemanticSearchResult | undefined> {
    const { intent, dateRange, fileTypes, memoryTypes, keywords } = parsed;

    // Always do a semantic search
    const result = await this.semanticSearch.queryNaturalLanguage(parsed.query, {
      limit: 10,
      dateRange,
    });

    if (!result.success) {
      // Fallback to simple search
      return undefined;
    }

    // Filter results based on intent
    let filteredResults = result.data.results;

    // Filter by file type if specified
    if (fileTypes && fileTypes.length > 0) {
      filteredResults = filteredResults.filter((r) =>
        fileTypes.some((f: string) => r.fileName.includes(f))
      );
    }

    // Filter by memory type if specified
    if (memoryTypes && memoryTypes.length > 0) {
      filteredResults = filteredResults.filter((r) =>
        memoryTypes.some((t: string) => r.type.includes(t))
      );
    }

    return {
      ...result.data,
      results: filteredResults,
      total: filteredResults.length,
    };
  }

  /**
   * Process common query types
   */

  async processTemporalQuery(query: string): Promise<Result<SemanticSearchResult>> {
    const result = await this.process(query);
    if (!result.success) {
      return result as Result<SemanticSearchResult>;
    }
    return ok(result.data.searchResult || { results: [], query, total: 0 });
  }

  async processDecisionQuery(query: string): Promise<Result<SemanticSearchResult>> {
    return this.semanticSearch.findSimilarDecisions(query, { limit: 10 });
  }

  async processExplanationQuery(query: string): Promise<Result<SemanticSearchResult>> {
    return this.semanticSearch.search(query, { limit: 10, minScore: 0.4 });
  }

  /**
   * Convenience methods for common queries
   */

  async whatChanged(options?: { timeRange?: { start?: string; end?: string } }): Promise<Result<SemanticSearchResult>> {
    return this.processTemporalQuery('What changed?');
  }

  async whatChangedLastWeek(): Promise<Result<SemanticSearchResult>> {
    return this.processTemporalQuery('What changed last week?');
  }

  async whatChangedYesterday(): Promise<Result<SemanticSearchResult>> {
    return this.processTemporalQuery('What changed yesterday?');
  }

  async whatChangedToday(): Promise<Result<SemanticSearchResult>> {
    return this.processTemporalQuery('What changed today?');
  }

  async whatChangedThisMonth(): Promise<Result<SemanticSearchResult>> {
    return this.processTemporalQuery('What changed this month?');
  }

  async whatChangedLastMonth(): Promise<Result<SemanticSearchResult>> {
    return this.processTemporalQuery('What changed last month?');
  }

  async findDecisions(query: string): Promise<Result<SemanticSearchResult>> {
    return this.processDecisionQuery(query);
  }

  async explain(query: string): Promise<Result<SemanticSearchResult>> {
    return this.processExplanationQuery(query);
  }

  async search(query: string, options?: { limit?: number; minScore?: number; type?: string }): Promise<Result<SemanticSearchResult>> {
    return this.semanticSearch.search(query, { limit: options?.limit || 10, minScore: options?.minScore, type: options?.type });
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<Result<void>> {
    return this.semanticSearch.initialize();
  }

  /**
   * Check if NL queries are enabled
   */
  isEnabled(): boolean {
    return this.semanticSearch.isEnabled();
  }

  /**
   * Enable NL queries
   */
  enable(): void {
    this.semanticSearch.enable();
  }

  /**
   * Disable NL queries
   */
  disable(): void {
    this.semanticSearch.disable();
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────

function createNLQueryProcessor(config?: Partial<NLQueryConfig>): NLQueryProcessor {
  return new NLQueryProcessor(config);
}

// ─── Exports ───────────────────────────────────────────────────────────────

export { NLQueryProcessor, createNLQueryProcessor };
export type { NLQueryConfig, ParsedQuery, QueryIntent, NLQueryResult };
