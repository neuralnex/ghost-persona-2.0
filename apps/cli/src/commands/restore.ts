import { Command } from 'commander';
import { ghost } from '../utils.js';
import { SyncManager } from '@ghost-persona/sync-manager';
import { password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';

export function restoreCommand(): Command {
  return new Command('restore')
    .description('Pull vault from Git and decrypt memory files')
    .option('-p, --password <password>', 'Vault password')
    .option('--remote <remote>', 'Git remote', 'origin')
    .option('--branch <branch>', 'Git branch')
    .action(async (opts) => {
      ghost.title('Restore Vault');

      const sync = new SyncManager(process.cwd());

      let pwd: string = opts.password;
      if (!pwd) {
        pwd = await password({ message: 'Enter vault password:' });
      }

      const spinner = ora('Pulling and decrypting vault...').start();

      const result = await sync.restore({
        password: pwd,
        remote: opts.remote,
        branch: opts.branch,
      });

      if (!result.success) {
        spinner.fail('Restore failed');
        ghost.error(result.error.message);
        process.exit(1);
      }

      spinner.succeed('Vault restored');
      ghost.success('Memory files available in .ghost/');
      ghost.info(`Run ${chalk.cyan('ghost status')} to verify`);
      ghost.info(`Run ${chalk.cyan('ghost brief')} to generate your AI briefing`);
    });
}
