import { Command } from 'commander';
import { ghost } from '../utils.js';
import { CloudSyncManager } from '@ghost-persona/cloud-sync';
import chalk from 'chalk';

export function cloudStatusCommand(): Command {
  return new Command('cloud-status')
    .description('Check cloud sync status')
    .option('-e, --endpoint <url>', 'Cloud endpoint URL', 'http://localhost:3000')
    .option('-p, --provider <provider>', 'Cloud provider: http, firebase, supabase', 'http')
    .option('--api-key <key>', 'API key for cloud provider')
    .option('--project-id <id>', 'Project identifier')
    .option('--team-id <id>', 'Team identifier')
    .action(async (opts) => {
      ghost.title('Cloud Status');

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

      const status = cloudSync.getStatus();

      ghost.info(`\n${chalk.bold('Connection Status:')}`);
      ghost.info(`  Online: ${status.online ? chalk.green('✓ Connected') : chalk.red('✗ Disconnected')}`);
      ghost.info(`  Syncing: ${status.syncing ? chalk.yellow('In Progress...') : chalk.green('Idle')}`);
      
      if (status.lastSyncedAt) {
        ghost.info(`  Last Synced: ${chalk.dim(status.lastSyncedAt)}`);
      }
      
      if (status.lastError) {
        ghost.error(`  Last Error: ${chalk.red(status.lastError)}`);
      }
      
      ghost.info(`\n${chalk.bold('Pending Changes:')} ${status.pendingChanges}`);

      ghost.success('\nCloud sync is ready');
    });
}
