/**
 * MCP Server for Ghost Persona
 * 
 * Implements a simplified Model Context Protocol (MCP) server for Ghost Persona.
 * This provides AI coding agents (Claude Code, Cursor, etc.) with access to
 * Ghost Persona's memory and context features via a standard protocol.
 * 
 * MCP Specification: https://github.com/modelcontextprotocol/specification
 * 
 * Features:
 * - Read project memory files
 * - Search memory (keyword and semantic)
 * - Create snapshots
 * - Get context briefings
 * - Query project state
 */

import { MemoryEngine } from '@ghost-persona/memory-engine';
import { ok, err, Result } from '@ghost-persona/shared';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MCPRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ServerConfig {
  projectRoot?: string;
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

// ─── MCP Tools ────────────────────────────────────────────────────────────

/**
 * Available MCP tools exposed by Ghost Persona
 */
const MCP_TOOLS = {
  ghost_brief: {
    description: 'Generate an AI-ready briefing of the project',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ghost_search: {
    description: 'Keyword search across project memory files',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  ghost_semantic_search: {
    description: 'Semantic search using vector embeddings',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Maximum results', default: 10 },
        minScore: { type: 'number', description: 'Minimum similarity score', default: 0.5 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  ghost_query: {
    description: 'Ask a natural language question about the project',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'Natural language question' },
      },
      required: ['question'],
      additionalProperties: false,
    },
  },
  ghost_snapshot: {
    description: 'Create a point-in-time memory snapshot',
    inputSchema: {
      type: 'object',
      properties: {
        currentGoal: { type: 'string', description: 'Current development goal' },
        knownIssues: { type: 'array', items: { type: 'string' }, description: 'Known issues' },
        nextTasks: { type: 'array', items: { type: 'string' }, description: 'Next tasks' },
      },
      additionalProperties: false,
    },
  },
  ghost_tech_stack: {
    description: 'Detect and return project technology stack',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ghost_status: {
    description: 'Get Ghost Persona status and metadata',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  ghost_read_memory: {
    description: 'Read a specific memory file',
    inputSchema: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          enum: ['project.md', 'architecture.md', 'decisions.md', 'roadmap.md', 'current-work.md', 'file-history.md', 'developer-persona.md'],
        },
      },
      required: ['fileName'],
      additionalProperties: false,
    },
  },
  ghost_changes: {
    description: 'Get changes for a time period',
    inputSchema: {
      type: 'object',
      properties: {
        period: {
          type: 'string',
          enum: ['today', 'yesterday', 'week', 'month', 'last-week', 'last-month'],
          description: 'Time period',
        },
        days: { type: 'number', description: 'Number of days' },
      },
      additionalProperties: false,
    },
  },
};

// ─── MCP Server ────────────────────────────────────────────────────────────

class GhostMCPServer {
  private engine: MemoryEngine | null = null;
  private projectRoot: string;
  private config: ServerConfig;
  private requestId: number = 1;

  constructor(config: ServerConfig = {}) {
    this.projectRoot = config.projectRoot || process.cwd();
    this.config = config;
  }

  /**
   * Initialize the MCP server and memory engine
   */
  async initialize(): Promise<Result<void>> {
    try {
      this.engine = await MemoryEngine.fromDirectory(this.projectRoot);
      const initResult = await this.engine.initialize();
      
      if (!initResult.success) {
        return err(initResult.error);
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Handle an MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    if (!this.engine) {
      return {
        id: request.id,
        error: { code: -32000, message: 'Memory engine not initialized' },
      };
    }

    try {
      let result: unknown;

      switch (request.method) {
        case 'tools/list':
          result = this.listTools();
          break;
        
        case 'tools/call':
          const { name, arguments: args } = request.params as { name: string; arguments: Record<string, unknown> };
          result = await this.callTool(name, args || {});
          break;

        default:
          return {
            id: request.id,
            error: { code: -32601, message: `Unknown method: ${request.method}` },
          };
      }

      return {
        id: request.id,
        result,
      };
    } catch (error) {
      return {
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * List all available tools
   */
  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    return Object.entries(MCP_TOOLS).map(([name, tool]) => ({
      name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Call a specific tool
   */
  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.engine) {
      throw new Error('Memory engine not initialized');
    }

    switch (name) {
      case 'ghost_brief':
        return { content: await this.engine.generateBrief() };

      case 'ghost_search':
        const query = (args as { query: string }).query;
        const limit = (args as { limit?: number }).limit || 10;
        return { results: await this.engine.search(query) };

      case 'ghost_semantic_search': {
        const query = (args as { query: string }).query;
        const options = {
          limit: (args as { limit?: number }).limit || 10,
          minScore: (args as { minScore?: number }).minScore || 0.5,
        };
        const result = await this.engine.semanticSearch(query, options);
        if (!result.success) {
          throw new Error(result.error.message);
        }
        return { results: result.data.results };
      }

      case 'ghost_query': {
        const question = (args as { question: string }).question;
        const result = await this.engine.queryNaturalLanguage(question);
        if (!result.success) {
          throw new Error(result.error.message);
        }
        return { result: result.data };
      }

      case 'ghost_snapshot': {
        const options = {
          currentGoal: (args as { currentGoal?: string }).currentGoal,
          knownIssues: (args as { knownIssues?: string[] }).knownIssues || [],
          nextTasks: (args as { nextTasks?: string[] }).nextTasks || [],
        };
        const result = await this.engine.createSnapshot(options);
        if (!result.success) {
          throw new Error(result.error.message);
        }
        return { snapshot: result.data };
      }

      case 'ghost_tech_stack': {
        const result = await this.engine.getTechStack();
        return { techStack: result };
      }

      case 'ghost_status': {
        return this.engine.getStatus();
      }

      case 'ghost_read_memory': {
        const fileName = (args as { fileName: string }).fileName as any;
        const memory = await this.engine['generator'].readAllMemory();
        return { content: memory[fileName] || '' };
      }

      case 'ghost_changes': {
        const period = (args as { period?: string }).period;
        
        // Map period to method
        if (period === 'last-week' || period === 'week') {
          const result = await this.engine.whatChangedLastWeek();
          if (!result.success) throw new Error(result.error.message);
          return { results: result.data.results };
        }
        if (period === 'yesterday') {
          const result = await this.engine.whatChangedYesterday();
          if (!result.success) throw new Error(result.error.message);
          return { results: result.data.results };
        }
        if (period === 'today') {
          const result = await this.engine.whatChangedToday();
          if (!result.success) throw new Error(result.error.message);
          return { results: result.data.results };
        }
        if (period === 'month') {
          const result = await this.engine.whatChangedThisMonth();
          if (!result.success) throw new Error(result.error.message);
          return { results: result.data.results };
        }
        if (period === 'last-month') {
          const result = await this.engine.whatChangedThisMonth();
          if (!result.success) throw new Error(result.error.message);
          return { results: result.data.results };
        }
        
        // Default: last 7 days
        const result = await this.engine.whatChangedLastWeek();
        if (!result.success) throw new Error(result.error.message);
        return { results: result.data.results };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Start the MCP server on stdio
   * 
   * This reads JSON-RPC requests from stdin and writes responses to stdout,
   * which is the standard transport for MCP servers.
   */
  async start(): Promise<void> {
    // Initialize engine
    const initResult = await this.initialize();
    if (!initResult.success) {
      console.error('Failed to initialize:', initResult.error.message);
      process.exit(1);
    }

    if (this.config.logLevel !== 'error') {
      console.log('👻 Ghost Persona MCP Server');
      console.log(`   Project: ${this.projectRoot}`);
      console.log(`   Tools: ${Object.keys(MCP_TOOLS).length} registered`);
      console.log('   Transport: stdio');
      console.log('   Ready for requests...\n');
    }

    // Read from stdin
    process.stdin.on('data', async (data) => {
      try {
        const request = JSON.parse(data.toString()) as MCPRequest;
        const response = await this.handleRequest(request);
        process.stdout.write(JSON.stringify(response) + '\n');
      } catch (error) {
        const errorResponse: MCPResponse = {
          id: this.requestId++,
          error: {
            code: -32700,
            message: error instanceof Error ? error.message : String(error),
          },
        };
        process.stdout.write(JSON.stringify(errorResponse) + '\n');
      }
    });

    process.stdin.on('end', () => {
      if (this.config.logLevel !== 'error') {
        console.log('\nMCP Server shutting down...');
      }
    });
  }

  /**
   * Get the list of available tools (for programmatic access)
   */
  getToolList(): typeof MCP_TOOLS {
    return { ...MCP_TOOLS };
  }

  /**
   * Get the server configuration
   */
  getConfig(): ServerConfig {
    return { ...this.config };
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────

export type { ServerConfig, MCPRequest, MCPResponse };
export { GhostMCPServer, MCP_TOOLS };
export default GhostMCPServer;
