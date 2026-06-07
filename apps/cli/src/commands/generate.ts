import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';

export function generateCommand(): Command {
  return new Command('generate')
    .description('Regenerate memory files from current project state')
    .action(async () => {
      await requireGhostInit();
      ghost.title('Generate');
      ghost.info('File watcher handles incremental generation. For a full refresh, re-initialize.');
      ghost.info('Run: ghost init');
    });
}
