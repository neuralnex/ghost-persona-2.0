import chalk from 'chalk';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { GHOST_DIR } from '@ghost-persona/shared';
import path from 'path';
import fs from 'fs/promises';

export const ghost = {
  title: (msg: string) => console.log(chalk.cyan(`\n👻 ${msg}`)),
  success: (msg: string) => console.log(chalk.green(`  ✓ ${msg}`)),
  error: (msg: string) => console.error(chalk.red(`  ✗ ${msg}`)),
  warn: (msg: string) => console.log(chalk.yellow(`  ⚠ ${msg}`)),
  info: (msg: string) => console.log(chalk.dim(`  · ${msg}`)),
  log: (msg: string) => console.log(`  ${msg}`),
  separator: () => console.log(chalk.dim('  ' + '─'.repeat(50))),
};

export async function requireGhostInit(projectRoot = process.cwd()): Promise<MemoryEngine> {
  const ghostDir = path.join(projectRoot, GHOST_DIR);
  try {
    await fs.access(ghostDir);
  } catch {
    ghost.error('Ghost not initialized in this directory.');
    ghost.info('Run: ghost init');
    process.exit(1);
  }
  return MemoryEngine.fromDirectory(projectRoot);
}

export async function getEngine(projectRoot = process.cwd()): Promise<MemoryEngine> {
  return MemoryEngine.fromDirectory(projectRoot);
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
