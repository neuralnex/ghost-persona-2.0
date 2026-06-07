import { Command } from 'commander';
import { requireGhostInit, ghost } from '../utils.js';
import ora from 'ora';
import fs from 'fs/promises';
import chalk from 'chalk';

export function briefCommand(): Command {
  return new Command('brief')
    .description('Generate an AI-ready context briefing')
    .option('-o, --output <file>', 'Write brief to file')
    .option('--copy', 'Copy to clipboard')
    .action(async (opts) => {
      const engine = await requireGhostInit();

      const spinner = ora('Generating AI briefing...').start();

      try {
        const brief = await engine.generateBrief();
        spinner.succeed('Brief generated');

        if (opts.output) {
          await fs.writeFile(opts.output, brief, 'utf-8');
          ghost.success(`Brief written to ${chalk.cyan(opts.output)}`);
        } else {
          ghost.separator();
          console.log(brief);
          ghost.separator();
          ghost.info('Use with Cursor, Claude Code, Aider, or any AI coding agent');
          ghost.info('Or save with: ghost brief -o BRIEFING.md');
        }
      } catch (e) {
        spinner.fail('Failed to generate brief');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
