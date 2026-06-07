import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { EncryptionService, validatePassword } from '@ghost-persona/encryption';
import { VAULT_FILE, Result, ok, err } from '@ghost-persona/shared';

const execAsync = promisify(exec);

export interface SyncOptions {
  password: string;
  remote?: string;
  branch?: string;
  commitMessage?: string;
}

export interface SyncResult {
  vaultPath: string;
  committed: boolean;
  pushed: boolean;
  commitHash?: string;
}

export class SyncManager {
  private readonly projectRoot: string;
  private readonly encryption: EncryptionService;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.encryption = new EncryptionService(projectRoot);
  }

  // ─── Sync (encrypt + commit + push) ───────────────────────────────────────

  async sync(options: SyncOptions): Promise<Result<SyncResult>> {
    const passwordCheck = validatePassword(options.password);
    if (!passwordCheck.valid) {
      return err(new Error(passwordCheck.message));
    }

    try {
      // Step 1: Encrypt vault
      const vaultPath = await this.encryption.encrypt(options.password);

      // Step 2: Ensure vault is tracked by git
      await this.gitAdd(VAULT_FILE);

      // Step 3: Commit
      const message = options.commitMessage ?? `ghost: sync vault ${new Date().toISOString()}`;
      const { committed, hash } = await this.gitCommit(message);

      // Step 4: Push
      let pushed = false;
      if (committed) {
        pushed = await this.gitPush(options.remote, options.branch);
      }

      return ok({
        vaultPath,
        committed,
        pushed,
        commitHash: hash,
      });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Restore (pull + decrypt) ──────────────────────────────────────────────

  async restore(options: Pick<SyncOptions, 'password' | 'remote' | 'branch'>): Promise<Result<void>> {
    const passwordCheck = validatePassword(options.password);
    if (!passwordCheck.valid) {
      return err(new Error(passwordCheck.message));
    }

    try {
      // Step 1: Pull latest
      await this.gitPull(options.remote, options.branch);

      // Step 2: Check vault exists
      const vaultPath = path.join(this.projectRoot, VAULT_FILE);
      try {
        await fs.access(vaultPath);
      } catch {
        return err(new Error(`No vault found at ${vaultPath}. Has ghost sync been run on another machine?`));
      }

      // Step 3: Decrypt
      await this.encryption.decrypt(options.password);

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  // ─── Git Helpers ───────────────────────────────────────────────────────────

  private async gitAdd(file: string): Promise<void> {
    await execAsync(`git add ${file}`, { cwd: this.projectRoot });
  }

  private async gitCommit(message: string): Promise<{ committed: boolean; hash?: string }> {
    try {
      await execAsync(`git commit -m "${message}"`, { cwd: this.projectRoot });
      const { stdout } = await execAsync('git rev-parse HEAD', { cwd: this.projectRoot });
      return { committed: true, hash: stdout.trim() };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // "nothing to commit" is not an error
      if (msg.includes('nothing to commit')) {
        return { committed: false };
      }
      throw e;
    }
  }

  private async gitPush(remote = 'origin', branch?: string): Promise<boolean> {
    try {
      const branchPart = branch ? ` HEAD:${branch}` : '';
      await execAsync(`git push ${remote}${branchPart}`, { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  private async gitPull(remote = 'origin', branch?: string): Promise<void> {
    const branchPart = branch ? ` ${branch}` : '';
    await execAsync(`git pull ${remote}${branchPart}`, { cwd: this.projectRoot });
  }

  // ─── Git Status ────────────────────────────────────────────────────────────

  async isGitRepo(): Promise<boolean> {
    try {
      await execAsync('git rev-parse --git-dir', { cwd: this.projectRoot });
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.projectRoot,
      });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  async getLastCommit(): Promise<{ hash: string; message: string } | null> {
    try {
      const { stdout: hash } = await execAsync('git rev-parse HEAD', { cwd: this.projectRoot });
      const { stdout: message } = await execAsync('git log -1 --pretty=%B', {
        cwd: this.projectRoot,
      });
      return { hash: hash.trim(), message: message.trim() };
    } catch {
      return null;
    }
  }
}
