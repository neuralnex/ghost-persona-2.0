import { Command } from 'commander';
import ora from 'ora';
import { requireGhostInit, ghost } from '../utils.js';
import { SyncManager } from '@ghost-persona/sync-manager';
import chalk from 'chalk';

export function snapshotCommand(): Command {
  return new Command('snapshot')
    .description('Create a memory snapshot of the current project state')
    .option('--goal <goal>', 'Current development goal')
    .option('--issue <issue...>', 'Known issues')
    .option('--task <task...>', 'Next tasks')
    .option('--commit', 'Also commit the snapshot to Git')
    .action(async (opts) => {
      const engine = await requireGhostInit();
      const sync = new SyncManager(process.cwd());

      const spinner = ora('Creating snapshot...').start();

      // Try to get git info
      let commit: string | undefined;
      let branch: string | undefined;

      if (await sync.isGitRepo()) {
        const lastCommit = await sync.getLastCommit();
        branch = (await sync.getCurrentBranch()) ?? undefined;
        commit = lastCommit?.hash?.slice(0, 8);
      }

      const result = await engine.createSnapshot({
        commit,
        branch,
        currentGoal: opts.goal,
        knownIssues: opts.issue ?? [],
        nextTasks: opts.task ?? [],
      });

      if (!result.success) {
        spinner.fail('Snapshot failed');
        ghost.error(result.error.message);
        process.exit(1);
      }

      spinner.succeed('Snapshot created');

      const snapshot = result.data;
      ghost.separator();
      ghost.log(`ID:      ${chalk.dim(snapshot.id)}`);
      ghost.log(`Date:    ${chalk.cyan(snapshot.date.toISOString())}`);
      if (commit) ghost.log(`Commit:  ${chalk.dim(commit)}`);
      if (branch) ghost.log(`Branch:  ${chalk.cyan(branch)}`);
      ghost.log(`Goal:    ${snapshot.currentGoal}`);
      ghost.separator();
      ghost.info(`Saved to .ghost/snapshots/`);
    });
}
