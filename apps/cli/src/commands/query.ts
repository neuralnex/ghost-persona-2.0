import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import chalk from 'chalk';

export function queryCommand(): Command {
  return new Command('query')
    .description('Ask natural language questions about your project')
    .alias('q')
    .argument('<question>', 'Your question in natural language')
    .option('--limit <limit>', 'Maximum number of results', '10')
    .action(async (question: string, opts: { limit: string }) => {
      const engine = await requireGhostInit();
      const limit = parseInt(opts.limit) || 10;

      ghost.title(`Query: "${question}"`);

      const result = await engine.queryNaturalLanguage(question, { limit });

      if (!result.success) {
        ghost.error(`Query processing failed: ${result.error.message}`);
        ghost.info('Make sure vector search is enabled and configured in config.json');
        return;
      }

      const parsed = result.data.parsed;
      const searchResult = result.data.searchResult;

      // Show parsed intent
      ghost.separator();
      console.log(chalk.cyan('  Intent: ') + chalk.white(parsed.intent));
      
      if (parsed.dateRange) {
        console.log(chalk.cyan('  Date Range: ') + chalk.white(`${parsed.dateRange.start} to ${parsed.dateRange.end}`));
      }
      
      if (parsed.fileTypes?.length) {
        console.log(chalk.cyan('  Files: ') + chalk.white(parsed.fileTypes.join(', ')));
      }
      
      if (parsed.keywords?.length) {
        console.log(chalk.cyan('  Keywords: ') + chalk.white(parsed.keywords.join(', ')));
      }
      
      ghost.separator();

      if (!searchResult || searchResult.total === 0) {
        ghost.info('No results found for this query.');
        ghost.info('Try a different question or enable vector search with semantic indexing.');
        return;
      }

      console.log(chalk.cyan(`  Found ${searchResult.total} result(s):\n`));

      for (const hit of searchResult.results) {
        console.log(chalk.green(`  [${hit.fileName}]`) + chalk.dim(` (score: ${hit.score.toFixed(2)})`));
        console.log(chalk.white(`  ${hit.content.substring(0, 200)}${hit.content.length > 200 ? '...' : ''}`));
        console.log('');
      }

      ghost.separator();
      ghost.success(`${searchResult.total} result(s) for "${question}"`);
    });
}
