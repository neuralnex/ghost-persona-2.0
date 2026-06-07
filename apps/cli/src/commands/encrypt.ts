import { Command } from 'commander';
import { ghost } from '../utils.js';
import { EncryptionService, validatePassword } from '@ghost-persona/encryption';
import { password } from '@inquirer/prompts';
import ora from 'ora';
import chalk from 'chalk';

export function encryptCommand(): Command {
  return new Command('encrypt')
    .description('Encrypt the .ghost vault')
    .option('-p, --password <password>', 'Encryption password (insecure, prefer prompt)')
    .action(async (opts) => {
      ghost.title('Encrypt Vault');

      let pwd: string = opts.password;

      if (!pwd) {
        pwd = await password({ message: 'Enter vault password:' });
        const confirm = await password({ message: 'Confirm password:' });
        if (pwd !== confirm) {
          ghost.error('Passwords do not match');
          process.exit(1);
        }
      }

      const check = validatePassword(pwd);
      if (!check.valid) {
        ghost.error(check.message ?? 'Invalid password');
        process.exit(1);
      }

      const spinner = ora('Encrypting vault...').start();

      try {
        const encryption = new EncryptionService(process.cwd());
        const vaultPath = await encryption.encrypt(pwd);
        spinner.succeed('Vault encrypted');
        ghost.success(`Vault saved to: ${chalk.cyan(vaultPath)}`);
        ghost.info('Add ghost.vault to your git repository to sync across machines');
      } catch (e) {
        spinner.fail('Encryption failed');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
