import { Command } from 'commander';
import chalk from 'chalk';
import { requireGhostInit, ghost, formatDate } from '../utils.js';
import { GHOST_DIR, MEMORY_FILES } from '@ghost-persona/shared';
import fs from 'fs/promises';
import path from 'path';

export function statusCommand(): Command {
  return new Command('status')
    .description('Show Ghost Persona status and memory overview')
    .action(async () => {
      const engine = await requireGhostInit();
      const status = engine.getStatus();

      ghost.title('Ghost Persona Status');
      ghost.separator();

      ghost.log(`Project:   ${chalk.cyan(status.config.projectName)}`);
      ghost.log(`Root:      ${chalk.dim(status.config.projectRoot)}`);
      ghost.log(`Watcher:   ${status.watching ? chalk.green('Active') : chalk.dim('Inactive')}`);
      ghost.log(`Mode:      ${chalk.yellow(status.config.summarization)}`);
      ghost.log(`API Port:  ${chalk.cyan(status.config.apiPort)}`);

      ghost.separator();
      ghost.log(chalk.dim('Memory Files:'));

      const ghostDir = path.join(status.config.projectRoot, GHOST_DIR);

      for (const file of MEMORY_FILES) {
        const filePath = path.join(ghostDir, file);
        try {
          const stat = await fs.stat(filePath);
          const size = `${Math.round(stat.size / 1024 * 10) / 10}kb`;
          ghost.log(`  ${chalk.green('✓')} ${file.padEnd(25)} ${chalk.dim(size.padStart(6))}  ${chalk.dim(formatDate(stat.mtime))}`);
        } catch {
          ghost.log(`  ${chalk.dim('○')} ${chalk.dim(file)}`);
        }
      }

      ghost.separator();
      ghost.log(chalk.dim('Commands:'));
      ghost.log(`  ${chalk.cyan('ghost watch')}     Start file tracking`);
      ghost.log(`  ${chalk.cyan('ghost brief')}     Generate AI briefing`);
      ghost.log(`  ${chalk.cyan('ghost snapshot')}  Create a memory snapshot`);
    });
}
