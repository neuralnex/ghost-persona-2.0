import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import chalk from 'chalk';

export function searchCommand(): Command {
  return new Command('search')
    .description('Search project memory for a topic')
    .argument('<query>', 'Search query')
    .action(async (query: string) => {
      const engine = await requireGhostInit();

      ghost.title(`Search: "${query}"`);

      const results = await engine.search(query);

      if (results.length === 0) {
        ghost.info('No results found in project memory.');
        return;
      }

      ghost.separator();
      for (const result of results) {
        console.log(chalk.dim('  ▸ ') + result);
        console.log('');
      }
      ghost.separator();
      ghost.info(`${results.length} result(s) found`);
    });
}
