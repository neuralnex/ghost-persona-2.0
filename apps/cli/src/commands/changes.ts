import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import chalk from 'chalk';

export function changesCommand(): Command {
  return new Command('changes')
    .description('Show what changed in a specific time period')
    .option('--week', 'Show changes from last week')
    .option('--yesterday', 'Show changes from yesterday')
    .option('--today', 'Show changes from today')
    .option('--month', 'Show changes from this month')
    .option('--last-month', 'Show changes from last month')
    .option('--days <days>', 'Show changes from the last N days')
    .option('--limit <limit>', 'Maximum number of results', '10')
    .action(async (opts: {
      week?: boolean;
      yesterday?: boolean;
      today?: boolean;
      month?: boolean;
      lastMonth?: boolean;
      days?: string;
      limit?: string;
    }) => {
      const engine = await requireGhostInit();
      const limit = parseInt(opts.limit || '10');

      // Determine which temporal query to use
      let query: string;
      let timeRange: { start?: string; end?: string } | undefined;

      if (opts.week) {
        query = 'What changed last week?';
      } else if (opts.yesterday) {
        query = 'What changed yesterday?';
      } else if (opts.today) {
        query = 'What changed today?';
      } else if (opts.month) {
        query = 'What changed this month?';
      } else if (opts.lastMonth) {
        query = 'What changed last month?';
      } else if (opts.days) {
        query = `What changed in the last ${opts.days} days?`;
      } else {
        // Default to last week
        query = 'What changed last week?';
      }

      ghost.title(query);

      const result = await engine.queryNaturalLanguage(query, { limit });

      if (!result.success) {
        ghost.error(`Failed to process query: ${result.error.message}`);
        return;
      }

      const searchResult = result.data.searchResult;

      if (!searchResult || searchResult.total === 0) {
        ghost.info('No changes found for the specified time period.');
        ghost.info('Make sure you have memory files and vector search is enabled.');
        return;
      }

      ghost.separator();
      console.log(chalk.cyan(`  Changes for "${query}":\n`));

      for (const hit of searchResult.results) {
        console.log(chalk.green(`  [${hit.fileName}]`) + chalk.dim(` (score: ${hit.score.toFixed(2)})`));
        console.log(chalk.white(`  ${hit.content.substring(0, 250)}${hit.content.length > 250 ? '...' : ''}`));
        console.log('');
      }

      ghost.separator();
      ghost.success(`${searchResult.total} change(s) found for "${query}"`);
    });
}
