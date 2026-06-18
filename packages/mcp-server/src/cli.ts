#!/usr/bin/env node
/**
 * CLI entry point for Ghost Persona MCP Server
 * 
 * Usage:
 *   npx @ghost-persona/mcp-server [options]
 *   
 * Options:
 *   --project-root <path>   Project directory (default: cwd)
 *   --port <port>          Port for HTTP mode (default: stdio)
 *   --log-level <level>   Log level: debug, info, warn, error
 *   --help                Show help
 */

import { GhostMCPServer } from './index.js';
import path from 'path';

interface CLIOptions {
  projectRoot?: string;
  port?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  help?: boolean;
}

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {};
  
  for (let i = 2; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      break;
    }
    
    if (arg === '--project-root' && args[i + 1]) {
      options.projectRoot = args[++i];
    } else if (arg === '--port' && args[i + 1]) {
      options.port = parseInt(args[++i], 10);
    } else if (arg === '--log-level' && args[i + 1]) {
      options.logLevel = args[++i] as 'debug' | 'info' | 'warn' | 'error';
    }
  }
  
  return options;
}

function showHelp(): void {
  console.log(`
Ghost Persona MCP Server

Usage: ghost-mcp [options]

Options:
  --project-root <path>   Project directory (default: current working directory)
  --port <port>          Port for HTTP mode (default: stdio)
  --log-level <level>   Log level: debug, info, warn, error (default: info)
  --help, -h             Show this help message

Description:
  The MCP (Model Context Protocol) server provides AI coding agents like
  Claude Code, Cursor, and others with access to Ghost Persona's memory
  and context features.
  
  By default, the server runs on stdio (standard input/output) which is
  the standard transport for MCP servers. AI agents communicate with the
  server via JSON-RPC messages.

Available Tools:
  - ghost_brief: Generate an AI-ready briefing
  - ghost_search: Keyword search across memory files
  - ghost_semantic_search: Semantic search using vector embeddings
  - ghost_query: Ask natural language questions
  - ghost_snapshot: Create a memory snapshot
  - ghost_tech_stack: Detect project technology stack
  - ghost_status: Get Ghost Persona status
  - ghost_read_memory: Read a specific memory file
  - ghost_changes: Get changes for a time period

Examples:
  # Start MCP server for current directory
  ghost-mcp

  # Start MCP server for a specific project
  ghost-mcp --project-root /path/to/project

  # Start with debug logging
  ghost-mcp --log-level debug
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const config = {
    projectRoot: args.projectRoot,
    port: args.port,
    logLevel: args.logLevel || 'info',
  };

  const server = new GhostMCPServer(config);
  
  try {
    await server.start();
  } catch (error) {
    console.error('MCP Server error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
