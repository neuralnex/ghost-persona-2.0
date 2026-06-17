import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import ora from 'ora';
import chalk from 'chalk';

// Note: This import will work after the packages are built
// @ts-ignore - git-history might not be built yet
import { GitHistoryAnalyzer, extractGitDecisions } from '@ghost-persona/git-history';

export function gitDecisionsCommand(): Command {
  return new Command('git-decisions')
    .description('Extract architectural decisions from git commit history')
    .option('-l, --limit <number>', 'Number of commits to analyze', '50')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const engine = await requireGhostInit();

      ghost.title('Extracting Decisions from Git History');

      const spinner = ora('Analyzing git commits...').start();

      try {
        const analyzer = new GitHistoryAnalyzer(process.cwd());
        
        if (!(await analyzer.isGitRepo())) {
          spinner.fail('Not a git repository');
          ghost.error('This command requires a git repository');
          process.exit(1);
        }

        const decisions = await analyzer.extractDecisions(opts.limit ? parseInt(opts.limit) : 50);
        
        spinner.succeed(`Found ${decisions.length} architectural decisions`);

        if (opts.json) {
          console.log(JSON.stringify(decisions, null, 2));
          return;
        }

        if (decisions.length === 0) {
          ghost.info('No architectural decisions found in commit history.');
          ghost.info('Try using commit messages with keywords like: decide, decided, decision, migrate, switch, etc.');
          return;
        }

        ghost.separator();

        // Sort by date (newest first for display)
        const sortedDecisions = [...decisions].sort((a, b) => b.date.getTime() - a.date.getTime());

        for (const decision of sortedDecisions) {
          const dateStr = decision.date.toISOString().split('T')[0];
          const statusColor = decision.status === 'accepted' ? chalk.green : 
                            decision.status === 'rejected' ? chalk.red : chalk.yellow;
          
          ghost.log(chalk.bold(`[${dateStr}] ${decision.title}`));
          ghost.log(`  Status: ${statusColor(decision.status)}`);
          if (decision.context) {
            ghost.log(`  Context: ${chalk.dim(decision.context)}`);
          }
          if (decision.rationale) {
            ghost.log(`  Rationale: ${chalk.dim(decision.rationale)}`);
          }
          ghost.log('');
        }

        ghost.separator();
        ghost.info(`Run ${chalk.cyan('ghost brief')} to see these decisions in your AI briefing`);
        ghost.info(`Run ${chalk.cyan('ghost status')} to see memory file status`);
      } catch (e) {
        spinner.fail('Failed to extract decisions');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
