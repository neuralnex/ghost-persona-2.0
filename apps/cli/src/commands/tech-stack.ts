import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import ora from 'ora';
import chalk from 'chalk';

// Note: This import will work after the packages are built
// @ts-ignore - tech-stack-detector might not be built yet
import { TechStackDetector } from '@ghost-persona/tech-stack-detector';

export function techStackCommand(): Command {
  return new Command('tech-stack')
    .description('Detect and display project technology stack')
    .option('--refresh', 'Force re-detect tech stack')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const engine = await requireGhostInit();

      ghost.title('Detecting Tech Stack');

      const spinner = ora('Analyzing project files...').start();

      try {
        const detector = new TechStackDetector(process.cwd());
        const result = await detector.detect();
        
        spinner.succeed('Tech stack detected');

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        ghost.separator();

        const { techStack } = result;

        if (techStack.languages.length > 0) {
          ghost.log(chalk.bold('Languages:'));
          techStack.languages.forEach((lang) => ghost.log(`  - ${chalk.cyan(lang)}`));
          ghost.log('');
        }

        if (techStack.frameworks.length > 0) {
          ghost.log(chalk.bold('Frameworks:'));
          techStack.frameworks.forEach((fw) => ghost.log(`  - ${chalk.yellow(fw)}`));
          ghost.log('');
        }

        if (techStack.databases.length > 0) {
          ghost.log(chalk.bold('Databases:'));
          techStack.databases.forEach((db) => ghost.log(`  - ${chalk.green(db)}`));
          ghost.log('');
        }

        if (techStack.packageManagers.length > 0) {
          ghost.log(chalk.bold('Package Managers:'));
          techStack.packageManagers.forEach((pm) => ghost.log(`  - ${pm}`));
          ghost.log('');
        }

        if (techStack.testing.length > 0) {
          ghost.log(chalk.bold('Testing:'));
          techStack.testing.forEach((test) => ghost.log(`  - ${test}`));
          ghost.log('');
        }

        if (techStack.linting.length > 0) {
          ghost.log(chalk.bold('Linting:'));
          techStack.linting.forEach((lint) => ghost.log(`  - ${lint}`));
          ghost.log('');
        }

        if (techStack.formatting.length > 0) {
          ghost.log(chalk.bold('Formatting:'));
          techStack.formatting.forEach((fmt) => ghost.log(`  - ${fmt}`));
          ghost.log('');
        }

        if (techStack.tools.length > 0) {
          ghost.log(chalk.bold('Other Tools:'));
          techStack.tools.slice(0, 10).forEach((tool) => ghost.log(`  - ${tool}`));
          ghost.log('');
        }

        if (result.dependencies.length > 0) {
          ghost.log(chalk.bold(`Dependencies: ${result.dependencies.length} total`));
          ghost.log('');
        }

        ghost.separator();
        ghost.info(`Run ${chalk.cyan('ghost brief')} to see how this improves your AI briefing`);
      } catch (e) {
        spinner.fail('Tech stack detection failed');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
