import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { input, confirm } from '@inquirer/prompts';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { GhostConfig, DEFAULT_CONFIG, GHOST_DIR } from '@ghost-persona/shared';
import { ghost } from '../utils.js';
import path from 'path';
import fs from 'fs/promises';

export function initCommand(): Command {
  return new Command('init')
    .description('Initialize Ghost Persona in the current project')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option('--name <name>', 'Project name')
    .action(async (opts) => {
      ghost.title('Initializing Ghost Persona');

      const projectRoot = process.cwd();
      const ghostDir = path.join(projectRoot, GHOST_DIR);

      // Check if already initialized
      try {
        await fs.access(ghostDir);
        const overwrite = opts.yes
          ? false
          : await confirm({ message: 'Ghost is already initialized. Re-initialize?', default: false });
        if (!overwrite) {
          ghost.info('Initialization cancelled.');
          return;
        }
      } catch {
        // Not initialized — continue
      }

      let projectName: string;

      if (opts.yes || opts.name) {
        projectName = opts.name ?? path.basename(projectRoot);
      } else {
        projectName = await input({
          message: 'Project name:',
          default: path.basename(projectRoot),
        });
      }

      const config: GhostConfig = {
        ...DEFAULT_CONFIG,
        projectName,
        projectRoot,
        ghostDir,
      };

      const spinner = ora('Creating memory files...').start();

      try {
        const engine = new MemoryEngine(config);
        const result = await engine.initialize();

        if (!result.success) {
          spinner.fail('Initialization failed');
          ghost.error(result.error.message);
          process.exit(1);
        }

        spinner.succeed('Memory files created');

        ghost.separator();
        ghost.success(`Initialized in ${chalk.cyan(projectRoot)}`);
        ghost.success(`Memory directory: ${chalk.cyan('.ghost/')}`);
        ghost.log('');
        ghost.log(chalk.dim('Memory files created:'));
        ghost.log(chalk.dim('  · .ghost/project.md'));
        ghost.log(chalk.dim('  · .ghost/architecture.md'));
        ghost.log(chalk.dim('  · .ghost/decisions.md'));
        ghost.log(chalk.dim('  · .ghost/roadmap.md'));
        ghost.log(chalk.dim('  · .ghost/current-work.md'));
        ghost.log(chalk.dim('  · .ghost/file-history.md'));
        ghost.log(chalk.dim('  · .ghost/developer-persona.md'));
        ghost.log('');
        ghost.info('Run ' + chalk.cyan('ghost watch') + ' to start tracking changes');
        ghost.info('Run ' + chalk.cyan('ghost brief') + ' to generate an AI briefing');
      } catch (e) {
        spinner.fail('Initialization failed');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
