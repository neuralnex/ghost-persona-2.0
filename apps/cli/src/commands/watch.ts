import { Command } from 'commander';
import chalk from 'chalk';
import { requireGhostInit, ghost } from '../utils.js';
import { ProcessedContext } from '@ghost-persona/context-processor';

export function watchCommand(): Command {
  return new Command('watch')
    .description('Start watching for file changes and updating memory')
    .action(async () => {
      const engine = await requireGhostInit();

      ghost.title('Ghost Persona — Watching');
      ghost.info('Press Ctrl+C to stop\n');

      engine.on('batch-processed', (context: ProcessedContext) => {
        const typeColor: Record<string, typeof chalk.green> = {
          'feature-addition': chalk.green,
          'feature-removal': chalk.red,
          'migration': chalk.yellow,
          'refactoring': chalk.blue,
          'testing': chalk.magenta,
          'configuration': chalk.cyan,
          'documentation': chalk.dim,
          'dependency': chalk.yellow,
          'general': chalk.white,
        };

        const color = typeColor[context.changeType] ?? chalk.white;
        const timestamp = new Date().toLocaleTimeString();

        console.log(
          chalk.dim(`  [${timestamp}] `) +
            color(`● ${context.title}`) +
            chalk.dim(` · ${context.affectedAreas.join(', ')}`)
        );
        console.log(chalk.dim(`           ${context.summary}`));
      });

      engine.on('error', (error: Error) => {
        ghost.error(error.message);
      });

      const result = await engine.start();

      if (!result.success) {
        ghost.error(result.error.message);
        process.exit(1);
      }

      ghost.success('Watcher started — memory will update automatically');

      // Keep process alive
      process.on('SIGINT', async () => {
        console.log('');
        ghost.info('Stopping watcher...');
        await engine.stop();
        ghost.success('Ghost Persona stopped.');
        process.exit(0);
      });
    });
}
