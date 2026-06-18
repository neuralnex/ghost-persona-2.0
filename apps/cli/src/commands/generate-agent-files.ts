import { Command } from 'commander';
import { ghost } from '../utils.js';
import { CursorRulesGenerator } from '@ghost-persona/cursor-rules';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';

export function generateAgentFilesCommand(): Command {
  return new Command('generate-agent-files')
    .description('Generate AI agent configuration files (.cursorrules and CLAUDE.md)')
    .option('--cursorrules', 'Generate .cursorrules file for Cursor AI')
    .option('--claude', 'Generate CLAUDE.md file for Claude Code')
    .option('--all', 'Generate both .cursorrules and CLAUDE.md')
    .option('-o, --output <dir>', 'Output directory', process.cwd())
    .action(async (opts) => {
      ghost.title('Generate AI Agent Files');

      const generator = new CursorRulesGenerator(opts.output);
      
      const initResult = await generator.initialize();
      if (!initResult.success) {
        ghost.error(`Initialization failed: ${initResult.error.message}`);
        process.exit(1);
      }

      const spinner = ora('Generating AI agent configuration...').start();

      try {
        const generateCursorRules = opts.all || opts.cursorrules;
        const generateClaude = opts.all || opts.claude;

        if (!generateCursorRules && !generateClaude) {
          spinner.fail('No files selected');
          ghost.error('Please specify --cursorrules, --claude, or --all');
          process.exit(1);
        }

        const result = await generator.generateAll({
          outputDir: opts.output,
          generateCursorRules,
          generateClaudeMD: generateClaude,
        });

        if (!result.success) {
          spinner.fail('Generation failed');
          ghost.error(result.error.message);
          process.exit(1);
        }

        spinner.succeed('Generated AI agent files');

        if (result.data.cursorRulesPath) {
          ghost.success(`✓ .cursorrules: ${chalk.dim(path.relative(process.cwd(), result.data.cursorRulesPath))}`);
        }
        
        if (result.data.claudeMDPath) {
          ghost.success(`✓ CLAUDE.md: ${chalk.dim(path.relative(process.cwd(), result.data.claudeMDPath))}`);
        }
      } catch (error) {
        spinner.fail('Generation failed');
        ghost.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
