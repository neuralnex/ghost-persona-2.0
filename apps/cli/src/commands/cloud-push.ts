import { Command } from 'commander';
import { ghost } from '../utils.js';
import { CloudSyncManager } from '@ghost-persona/cloud-sync';
import { password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';

export function cloudPushCommand(): Command {
  return new Command('cloud-push')
    .description('Push memory files to cloud storage')
    .option('-e, --endpoint <url>', 'Cloud endpoint URL', 'http://localhost:3000')
    .option('-p, --provider <provider>', 'Cloud provider: http, firebase, supabase', 'http')
    .option('--api-key <key>', 'API key for cloud provider')
    .option('--project-id <id>', 'Project identifier')
    .option('--team-id <id>', 'Team identifier for sharing')
    .option('--encrypt', 'Encrypt before pushing')
    .option('--password <password>', 'Encryption password')
    .option('-f, --force', 'Force full sync')
    .action(async (opts) => {
      ghost.title('Cloud Push');

      let pwd: string | undefined = opts.password;
      if (opts.encrypt && !pwd) {
        pwd = await password({ message: 'Enter encryption password:' });
      }

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

      const spinner = ora('Pushing memory to cloud...').start();

      const result = await cloudSync.push({
        encrypt: opts.encrypt,
        password: pwd,
        force: opts.force,
      });

      if (!result.success) {
        spinner.fail('Cloud push failed');
        ghost.error(result.error.message);
        process.exit(1);
      }

      spinner.succeed('Memory pushed to cloud');

      const manifest = result.data;
      ghost.success(`Project: ${chalk.cyan(manifest.projectName)}`);
      ghost.success(`Files: ${chalk.cyan(String(manifest.files.length))}`);
      ghost.success(`Manifest ID: ${chalk.dim(manifest.id)}`);
      
      if (manifest.encryption) {
        ghost.info(`Encryption: ${chalk.cyan(manifest.encryption.algorithm)}`);
      }
      
      if (manifest.sharing) {
        ghost.info(`Team: ${chalk.cyan(manifest.sharing.teamId)}`);
      }
    });
}
