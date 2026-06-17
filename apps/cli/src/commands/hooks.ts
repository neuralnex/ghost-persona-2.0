import { Command } from 'commander';
import { ghost } from '../utils.js';
import ora from 'ora';
import chalk from 'chalk';
import { SyncManager } from '@ghost-persona/sync-manager';
import { password } from '@inquirer/prompts';

export function hooksCommand(): Command {
  return new Command('hooks')
    .description('Manage Git commit hooks for automatic memory tracking')
    .option('--password <password>', 'Password for vault sync (for post-commit hook)')
    .action(async (opts) => {
      ghost.title('Git Hooks Management');

      const sync = new SyncManager(process.cwd());

      if (!(await sync.isGitRepo())) {
        ghost.error('Not a Git repository. Git hooks require a Git repository.');
        process.exit(1);
      }

      // Check current hook status
      const hasPreCommit = await sync.hasPreCommitHook();
      const hasPostCommit = await sync.hasPostCommitHook();

      ghost.separator();
      ghost.log(chalk.bold('Current Hook Status:'));
      ghost.log(`  Pre-commit hook:  ${hasPreCommit ? chalk.green('Installed') : chalk.dim('Not installed')}`);
      ghost.log(`  Post-commit hook: ${hasPostCommit ? chalk.green('Installed') : chalk.dim('Not installed')}`);
      ghost.log('');

      ghost.separator();
      ghost.log(chalk.bold('Available Actions:'));
      ghost.log(`  ${chalk.cyan('1')}  Install pre-commit hook (auto-snapshots)`);
      ghost.log(`  ${chalk.cyan('2')}  Install post-commit hook (auto-sync vault)`);
      ghost.log(`  ${chalk.cyan('3')}  Install both hooks`);
      ghost.log(`  ${chalk.cyan('4')}  Uninstall pre-commit hook`);
      ghost.log(`  ${chalk.cyan('5')}  Uninstall post-commit hook`);
      ghost.log(`  ${chalk.cyan('6')}  Uninstall all hooks`);
      ghost.log(`  ${chalk.cyan('0')}  Cancel`);
      ghost.log('');

      // Simple interactive selection
      const action = await new Promise<string>((resolve) => {
        process.stdin.resume();
        process.stdin.once('data', (data) => {
          resolve(data.toString().trim());
        });
        process.stdout.write('Select action (0-6): ');
      });

      const actionNum = parseInt(action);

      if (isNaN(actionNum) || actionNum < 0 || actionNum > 6) {
        ghost.error('Invalid selection');
        process.exit(1);
      }

      if (actionNum === 0) {
        ghost.info('Cancelled');
        process.exit(0);
      }

      const spinner = ora('Updating hooks...').start();

      try {
        let pwd: string | undefined = opts.password;

        // For post-commit hook, we need a password
        if ((actionNum === 2 || actionNum === 3) && !pwd) {
          pwd = await password({ message: 'Enter vault password for post-commit sync:' });
          const confirm = await password({ message: 'Confirm password:' });
          if (pwd !== confirm) {
            spinner.fail('Passwords do not match');
            process.exit(1);
          }
        }

        let message = '';

        switch (actionNum) {
          case 1: // Install pre-commit
            await sync.installPreCommitHook();
            message = 'Pre-commit hook installed';
            break;
          case 2: // Install post-commit
            if (pwd) {
              await sync.installPostCommitHook(pwd);
              message = 'Post-commit hook installed';
            } else {
              spinner.fail('Password required for post-commit hook');
              process.exit(1);
            }
            break;
          case 3: // Install both
            if (pwd) {
              await sync.installHooks({ password: pwd });
              message = 'Both hooks installed';
            } else {
              await sync.installPreCommitHook();
              message = 'Pre-commit hook installed (post-commit skipped - no password)';
            }
            break;
          case 4: // Uninstall pre-commit
            await sync.uninstallPreCommitHook();
            message = 'Pre-commit hook uninstalled';
            break;
          case 5: // Uninstall post-commit
            await sync.uninstallPostCommitHook();
            message = 'Post-commit hook uninstalled';
            break;
          case 6: // Uninstall all
            await sync.uninstallHooks();
            message = 'All hooks uninstalled';
            break;
        }

        spinner.succeed(message);
        
        // Show updated status
        const newPreCommit = await sync.hasPreCommitHook();
        const newPostCommit = await sync.hasPostCommitHook();

        ghost.log('');
        ghost.log(chalk.bold('Updated Hook Status:'));
        ghost.log(`  Pre-commit hook:  ${newPreCommit ? chalk.green('Installed') : chalk.dim('Not installed')}`);
        ghost.log(`  Post-commit hook: ${newPostCommit ? chalk.green('Installed') : chalk.dim('Not installed')}`);
        ghost.log('');

        ghost.info('Pre-commit hook: Creates memory snapshot before each commit');
        ghost.info('Post-commit hook: Syncs vault to remote after commit (requires password)');
        ghost.info('');
        ghost.info(`To manually create a snapshot: ${chalk.cyan('ghost snapshot')}`);
        ghost.info(`To manually sync: ${chalk.cyan('ghost sync')}`);
      } catch (e) {
        spinner.fail('Hook installation failed');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
