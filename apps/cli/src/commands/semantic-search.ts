import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import chalk from 'chalk';

export function semanticSearchCommand(): Command {
  return new Command('semantic-search')
    .description('Perform semantic search across project memory')
    .alias('ss')
    .argument('<query>', 'Semantic search query')
    .option('--limit <limit>', 'Maximum number of results', '10')
    .option('--min-score <score>', 'Minimum similarity score (0-1)', '0.5')
    .option('--type <type>', 'Filter by memory type (decision, file-history, architecture, general)')
    .action(async (query: string, opts: { limit: string; minScore: string; type?: string }) => {
      const engine = await requireGhostInit();
      const limit = parseInt(opts.limit) || 10;
      const minScore = parseFloat(opts.minScore) || 0.5;

      ghost.title(`Semantic Search: "${query}"`);

      const result = await engine.semanticSearch(query, {
        limit,
        minScore,
        type: opts.type,
      });

      if (!result.success) {
        ghost.error(`Semantic search failed: ${result.error.message}`);
        ghost.info('Make sure Qdrant is running and vector search is enabled in config.json');
        return;
      }

      if (result.data.total === 0) {
        ghost.info('No semantic matches found in project memory.');
        ghost.info('Try a different query or enable vector search in your config.');
        return;
      }

      ghost.separator();
      console.log(chalk.cyan(`  Found ${result.data.total} semantic match(es) for "${query}":\n`));

      for (const hit of result.data.results) {
        console.log(chalk.green(`  [${hit.fileName}]`) + chalk.dim(` (score: ${hit.score.toFixed(2)})`));
        console.log(chalk.white(`  ${hit.content.substring(0, 200)}${hit.content.length > 200 ? '...' : ''}`));
        console.log('');
      }

      ghost.separator();
      ghost.success(`${result.data.total} semantic result(s) found`);
      ghost.info(`Average relevance score: ${result.data.averageScore?.toFixed(2) || 'N/A'}`);
    });
}
