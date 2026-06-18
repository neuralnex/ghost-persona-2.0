import { Command } from 'commander';
import { ghost } from '../utils.js';
import { CloudSyncManager } from '@ghost-persona/cloud-sync';
import { password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';

export function cloudPullCommand(): Command {
  return new Command('cloud-pull')
    .description('Pull memory files from cloud storage')
    .option('-e, --endpoint <url>', 'Cloud endpoint URL', 'http://localhost:3000')
    .option('-p, --provider <provider>', 'Cloud provider: http, firebase, supabase', 'http')
    .option('--api-key <key>', 'API key for cloud provider')
    .option('--project-id <id>', 'Project identifier')
    .option('--team-id <id>', 'Team identifier for sharing')
    .option('--password <password>', 'Decryption password (if encrypted)')
    .option('-f, --force', 'Force full sync')
    .action(async (opts) => {
      ghost.title('Cloud Pull');

      let pwd: string | undefined = opts.password;

      const config = {
        provider: opts.provider as any,
        endpoint: opts.endpoint,
        apiKey: opts.apiKey,
        projectId: opts.projectId,
        teamId: opts.teamId,
        autoSync: false,
      };

      const cloudSync = new CloudSyncManager(process.cwd(), config);
      
      const initResult = await cloudSync.initialize();
      if (!initResult.success) {
        ghost.error(`Initialization failed: ${initResult.error.message}`);
        process.exit(1);
      }

      const spinner = ora('Pulling memory from cloud...').start();

      const result = await cloudSync.pull({
        password: pwd,
        force: opts.force,
      });

      if (!result.success) {
        spinner.fail('Cloud pull failed');
        ghost.error(result.error.message);
        process.exit(1);
      }

      spinner.succeed('Memory pulled from cloud');

      const manifest = result.data;
      ghost.success(`Project: ${chalk.cyan(manifest.projectName)}`);
      ghost.success(`Files: ${chalk.cyan(String(manifest.files.length))}`);
      ghost.success(`Updated: ${chalk.dim(new Date(manifest.updatedAt).toLocaleString())}`);
      
      if (manifest.encryption) {
        ghost.info(`Encryption: ${chalk.cyan(manifest.encryption.algorithm)}`);
      }
      
      if (manifest.sharing) {
        ghost.info(`Team: ${chalk.cyan(manifest.sharing.teamId)}`);
      }
    });
}
