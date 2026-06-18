#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { statusCommand } from './commands/status.js';
import { snapshotCommand } from './commands/snapshot.js';
import { generateCommand } from './commands/generate.js';
import { encryptCommand } from './commands/encrypt.js';
import { decryptCommand } from './commands/decrypt.js';
import { syncCommand } from './commands/sync.js';
import { restoreCommand } from './commands/restore.js';
import { briefCommand } from './commands/brief.js';
import { watchCommand } from './commands/watch.js';
import { searchCommand } from './commands/search.js';
import { semanticSearchCommand } from './commands/semantic-search.js';
import { queryCommand } from './commands/query.js';
import { changesCommand } from './commands/changes.js';
import { techStackCommand } from './commands/tech-stack.js';
import { gitDecisionsCommand } from './commands/git-decisions.js';
import { hooksCommand } from './commands/hooks.js';
import { cloudPushCommand } from './commands/cloud-push.js';
import { cloudPullCommand } from './commands/cloud-pull.js';
import { cloudStatusCommand } from './commands/cloud-status.js';
import { generateAgentFilesCommand } from './commands/generate-agent-files.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('ghost')
  .description(
    chalk.cyan('👻 Ghost Persona') +
      ' — AI coding agent memory system\n' +
      chalk.dim('  The codebase evolves. The documentation evolves automatically. The AI remembers.')
  )
  .version('0.3.0');

program.addCommand(initCommand());
program.addCommand(statusCommand());
program.addCommand(watchCommand());
program.addCommand(snapshotCommand());
program.addCommand(generateCommand());
program.addCommand(encryptCommand());
program.addCommand(decryptCommand());
program.addCommand(syncCommand());
program.addCommand(restoreCommand());
program.addCommand(briefCommand());
program.addCommand(searchCommand());
program.addCommand(semanticSearchCommand());
program.addCommand(queryCommand());
program.addCommand(changesCommand());
program.addCommand(techStackCommand());
program.addCommand(gitDecisionsCommand());
program.addCommand(hooksCommand());
program.addCommand(cloudPushCommand());
program.addCommand(cloudPullCommand());
program.addCommand(cloudStatusCommand());
program.addCommand(generateAgentFilesCommand());

program.parse(process.argv);
