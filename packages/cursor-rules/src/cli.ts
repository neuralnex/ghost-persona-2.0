#!/usr/bin/env node
/**
 * CLI for Cursor Rules Generator
 * 
 * Usage:
 *   npx @ghost-persona/cursor-rules [options]
 *   ghost generate-cursor-rules [options]
 * 
 * Options:
 *   --output-dir <path>     Output directory (default: cwd)
 *   --cursorrules-only     Only generate .cursorrules
 *   --claude-only          Only generate CLAUDE.md
 *   --no-cursorrules       Skip .cursorrules generation
 *   --no-claude            Skip CLAUDE.md generation
 *   --custom-rules <path>  Path to JSON file with custom rules
 *   --help, -h             Show help
 */

import { CursorRulesGenerator } from './index.js';
import path from 'path';
import fs from 'fs/promises';
import { ok, err, Result } from '@ghost-persona/shared';

interface CLIOptions {
  outputDir?: string;
  cursorrulesOnly?: boolean;
  claudeOnly?: boolean;
  noCursorrules?: boolean;
  noClaude?: boolean;
  customRules?: string;
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
    
    if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (arg === '--custom-rules' && args[i + 1]) {
      options.customRules = args[++i];
    } else if (arg === '--cursorrules-only') {
      options.cursorrulesOnly = true;
    } else if (arg === '--claude-only') {
      options.claudeOnly = true;
    } else if (arg === '--no-cursorrules') {
      options.noCursorrules = true;
    } else if (arg === '--no-claude') {
      options.noClaude = true;
    }
  }
  
  return options;
}

function showHelp(): void {
  console.log(`
Cursor Rules Generator

Usage: generate-cursor-rules [options]

Options:
  --output-dir <path>     Output directory (default: current working directory)
  --cursorrules-only     Only generate .cursorrules file
  --claude-only          Only generate CLAUDE.md file
  --no-cursorrules       Skip .cursorrules generation
  --no-claude            Skip CLAUDE.md generation
  --custom-rules <path>  Path to JSON file with custom rules to include
  --help, -h             Show this help message

Description:
  Auto-generates .cursorrules and CLAUDE.md files from Ghost Persona memory.
  These files provide AI coding agents (Cursor, Claude Code, etc.) with
  project-specific instructions and context.

Examples:
  # Generate both files in current directory
  generate-cursor-rules

  # Only generate .cursorrules
  generate-cursor-rules --cursorrules-only

  # Only generate CLAUDE.md
  generate-cursor-rules --claude-only

  # Generate in a specific directory
  generate-cursor-rules --output-dir /path/to/project

  # Include custom rules
  generate-cursor-rules --custom-rules custom-rules.json
`);
}

async function loadCustomRules(filePath: string): Promise<Result<any[]>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const rules = JSON.parse(content);
    
    if (!Array.isArray(rules)) {
      return err(new Error('Custom rules must be an array'));
    }
    
    return ok(rules);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const projectRoot = process.cwd();
  const generator = new CursorRulesGenerator(projectRoot);
  
  // Initialize
  const initResult = await generator.initialize();
  if (!initResult.success) {
    console.error('Failed to initialize:', initResult.error.message);
    process.exit(1);
  }

  // Load custom rules if specified
  let customRules: any[] | undefined;
  if (args.customRules) {
    const rulesResult = await loadCustomRules(args.customRules);
    if (!rulesResult.success) {
      console.error('Failed to load custom rules:', rulesResult.error.message);
      process.exit(1);
    }
    customRules = rulesResult.data;
  }

  // Determine what to generate
  const generateCursorRules = args.cursorrulesOnly || !args.noCursorrules;
  const generateClaudeMD = args.claudeOnly || !args.noClaude;

  try {
    const result = await generator.generateAll({
      outputDir: args.outputDir,
      generateCursorRules,
      generateClaudeMD,
      customRules,
    });

    if (!result.success) {
      console.error('Generation failed:', result.error.message);
      process.exit(1);
    }

    console.log('✓ Generation complete');
    
    if (result.data.cursorRulesPath) {
      console.log(`  .cursorrules: ${result.data.cursorRulesPath}`);
    }
    
    if (result.data.claudeMDPath) {
      console.log(`  CLAUDE.md: ${result.data.claudeMDPath}`);
    }
    
    console.log('\nFiles generated successfully!');
    console.log('These files will help AI coding agents understand your project better.');
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
