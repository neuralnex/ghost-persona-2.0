import { Command } from 'commander';
import { ghost } from '../utils.js';
import { SyncManager } from '@ghost-persona/sync-manager';
import { password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';

export function syncCommand(): Command {
  return new Command('sync')
    .description('Encrypt vault and push to remote Git repository')
    .option('-p, --password <password>', 'Vault password')
    .option('--remote <remote>', 'Git remote', 'origin')
    .option('--branch <branch>', 'Git branch')
    .option('-m, --message <message>', 'Commit message')
    .action(async (opts) => {
      ghost.title('Sync Vault');

      const sync = new SyncManager(process.cwd());

      if (!(await sync.isGitRepo())) {
        ghost.error('Not a Git repository. Ghost sync requires Git.');
        process.exit(1);
      }

      let pwd: string = opts.password;
      if (!pwd) {
        pwd = await password({ message: 'Enter vault password:' });
      }

      const spinner = ora('Encrypting and syncing vault...').start();

      const result = await sync.sync({
        password: pwd,
        remote: opts.remote,
        branch: opts.branch,
        commitMessage: opts.message,
      });

      if (!result.success) {
        spinner.fail('Sync failed');
        ghost.error(result.error.message);
        process.exit(1);
      }

      spinner.succeed('Vault synced');

      const { committed, pushed, commitHash } = result.data;
      ghost.success(`Vault encrypted: ${chalk.dim(result.data.vaultPath)}`);
      if (committed) ghost.success(`Committed: ${chalk.dim(commitHash?.slice(0, 8))}`);
      else ghost.info('No changes to commit');
      if (pushed) ghost.success(`Pushed to ${chalk.cyan(opts.remote)}`);
      else if (committed) ghost.warn('Push skipped or failed — commit is local only');
    });
}
