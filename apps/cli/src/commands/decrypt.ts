import { Command } from 'commander';
import { ghost } from '../utils.js';
import { EncryptionService } from '@ghost-persona/encryption';
import { password } from '@inquirer/prompts';
import ora from 'ora';

export function decryptCommand(): Command {
  return new Command('decrypt')
    .description('Decrypt the ghost vault and restore memory files')
    .option('-p, --password <password>', 'Vault password (insecure, prefer prompt)')
    .action(async (opts) => {
      ghost.title('Decrypt Vault');

      let pwd: string = opts.password;
      if (!pwd) {
        pwd = await password({ message: 'Enter vault password:' });
      }

      const spinner = ora('Decrypting vault...').start();

      try {
        const encryption = new EncryptionService(process.cwd());
        await encryption.decrypt(pwd);
        spinner.succeed('Vault decrypted');
        ghost.success('Memory files restored to .ghost/');
      } catch (e) {
        spinner.fail('Decryption failed');
        ghost.error(e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
