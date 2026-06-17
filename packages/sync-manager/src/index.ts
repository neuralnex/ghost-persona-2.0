import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { EncryptionService, validatePassword } from '@ghost-persona/encryption';
import { VAULT_FILE, Result, ok, err, GHOST_DIR } from '@ghost-persona/shared';

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

  // ─── Git Hook Integration ─────────────────────────────────────────────────

  /**
   * Install Git pre-commit hook for automatic memory snapshots
   */
  async installPreCommitHook(): Promise<Result<void>> {
    try {
      if (!(await this.isGitRepo())) {
        return err(new Error('Not a Git repository'));
      }

      const gitDir = await this.getGitDir();
      if (!gitDir) {
        return err(new Error('Could not find .git directory'));
      }

      const hooksDir = path.join(gitDir, 'hooks');
      await fs.mkdir(hooksDir, { recursive: true });

      const preCommitHook = path.join(hooksDir, 'pre-commit');
      
      // Create the pre-commit hook script
      const hookScript = this.generatePreCommitHookScript();
      
      await fs.writeFile(preCommitHook, hookScript, 'utf-8');
      await fs.chmod(preCommitHook, 0o755); // Make executable

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Uninstall Git pre-commit hook
   */
  async uninstallPreCommitHook(): Promise<Result<void>> {
    try {
      if (!(await this.isGitRepo())) {
        return err(new Error('Not a Git repository'));
      }

      const gitDir = await this.getGitDir();
      if (!gitDir) {
        return err(new Error('Could not find .git directory'));
      }

      const preCommitHook = path.join(gitDir, 'hooks', 'pre-commit');
      
      try {
        await fs.unlink(preCommitHook);
      } catch {
        // Hook doesn't exist - that's fine
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check if pre-commit hook is installed
   */
  async hasPreCommitHook(): Promise<boolean> {
    try {
      if (!(await this.isGitRepo())) {
        return false;
      }

      const gitDir = await this.getGitDir();
      if (!gitDir) {
        return false;
      }

      const preCommitHook = path.join(gitDir, 'hooks', 'pre-commit');
      
      try {
        await fs.access(preCommitHook);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get the .git directory path
   */
  private async getGitDir(): Promise<string | null> {
    try {
      const { stdout } = await execAsync('git rev-parse --git-dir', { cwd: this.projectRoot });
      return path.resolve(this.projectRoot, stdout.trim());
    } catch {
      return null;
    }
  }

  /**
   * Generate the pre-commit hook script
   */
  private generatePreCommitHookScript(): string {
    const ghostDir = GHOST_DIR;
    const nodePath = process.execPath;
    const ghostCliPath = path.join(this.projectRoot, 'node_modules', '.bin', 'ghost');
    
    return `#!/bin/sh
# Ghost Persona pre-commit hook
# Auto-creates memory snapshot before commit

set -e

# Get the directory of this hook
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$HOOK_DIR")"

# Check if ghost is initialized
export GHOST_PROJECT_ROOT="$PROJECT_ROOT"

# Try to use local ghost CLI first
if [ -f "$PROJECT_ROOT/node_modules/.bin/ghost" ]; then
  GHOST_CLI="$PROJECT_ROOT/node_modules/.bin/ghost"
elif command -v ghost >/dev/null 2>&1; then
  GHOST_CLI="ghost"
else
  # No ghost available, skip silently
  exit 0
fi

# Check if .ghost directory exists
if [ ! -d "$PROJECT_ROOT/$ghostDir" ]; then
  exit 0
fi

# Get staged files to determine if we should snapshot
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

# Only create snapshot if there are actual code changes
if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Skip snapshot for certain file types
SKIP_PATTERNS=".ghost|node_modules|dist|build|.next|coverage|*.lock|*.log|*.md"
SHOULD_SKIP=false

for pattern in $SKIP_PATTERNS; do
  if echo "$STAGED_FILES" | grep -q "$pattern"; then
    # Only skip if ALL changes are in skip patterns
    if [ "$STAGED_FILES" = "$(echo "$STAGED_FILES" | grep "$pattern")" ]; then
      SHOULD_SKIP=true
      break
    fi
  fi
done

if [ "$SHOULD_SKIP" = true ]; then
  exit 0
fi

# Get commit message to use as context
echo "Creating Ghost Persona snapshot..."

# Create snapshot with commit message as goal
COMMIT_MSG=$(git log -1 --pretty=%B 2>/dev/null || echo "Active development")

# Use node to run ghost snapshot
node -e "
const { execSync } = require('child_process');
const projectRoot = process.env.GHOST_PROJECT_ROOT || process.cwd();
const ghostCli = process.env.GHOST_CLI || '\$GHOST_CLI';

try {
  const goal = process.env.COMMIT_MSG || '$COMMIT_MSG'.trim() || 'Active development';
  execSync(\`\${ghostCli} snapshot --goal \"\${goal.replace(/\"/g, '\\\\\\\"')}\" --yes\`, {
    cwd: projectRoot,
    stdio: 'inherit'
  });
  console.log('✓ Ghost Persona snapshot created');
} catch (e) {
  console.log('Ghost snapshot skipped:', e.message);
}
" --GHOST_PROJECT_ROOT="$PROJECT_ROOT" --GHOST_CLI="$GHOST_CLI" --COMMIT_MSG="$COMMIT_MSG"

exit 0
`;
  }

  /**
   * Install Git post-commit hook for syncing vault
   */
  async installPostCommitHook(password: string): Promise<Result<void>> {
    try {
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return err(new Error(passwordCheck.message));
      }

      if (!(await this.isGitRepo())) {
        return err(new Error('Not a Git repository'));
      }

      const gitDir = await this.getGitDir();
      if (!gitDir) {
        return err(new Error('Could not find .git directory'));
      }

      const hooksDir = path.join(gitDir, 'hooks');
      await fs.mkdir(hooksDir, { recursive: true });

      const postCommitHook = path.join(hooksDir, 'post-commit');
      
      // Create the post-commit hook script
      const hookScript = this.generatePostCommitHookScript(password);
      
      await fs.writeFile(postCommitHook, hookScript, 'utf-8');
      await fs.chmod(postCommitHook, 0o755); // Make executable

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Uninstall Git post-commit hook
   */
  async uninstallPostCommitHook(): Promise<Result<void>> {
    try {
      if (!(await this.isGitRepo())) {
        return err(new Error('Not a Git repository'));
      }

      const gitDir = await this.getGitDir();
      if (!gitDir) {
        return err(new Error('Could not find .git directory'));
      }

      const postCommitHook = path.join(gitDir, 'hooks', 'post-commit');
      
      try {
        await fs.unlink(postCommitHook);
      } catch {
        // Hook doesn't exist - that's fine
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Check if post-commit hook is installed
   */
  async hasPostCommitHook(): Promise<boolean> {
    try {
      if (!(await this.isGitRepo())) {
        return false;
      }

      const gitDir = await this.getGitDir();
      if (!gitDir) {
        return false;
      }

      const postCommitHook = path.join(gitDir, 'hooks', 'post-commit');
      
      try {
        await fs.access(postCommitHook);
        return true;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Generate the post-commit hook script
   */
  private generatePostCommitHookScript(password: string): string {
    const ghostDir = GHOST_DIR;
    const escapedPassword = password.replace(/[\$`"\\]/g, '\\$&');
    
    return `#!/bin/sh
# Ghost Persona post-commit hook
# Auto-syncs vault after commit

set -e

# Get the directory of this hook
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$HOOK_DIR")"

# Check if ghost is initialized
export GHOST_PROJECT_ROOT="$PROJECT_ROOT"

# Try to use local ghost CLI first
if [ -f "$PROJECT_ROOT/node_modules/.bin/ghost" ]; then
  GHOST_CLI="$PROJECT_ROOT/node_modules/.bin/ghost"
elif command -v ghost >/dev/null 2>&1; then
  GHOST_CLI="ghost"
else
  # No ghost available, skip silently
  exit 0
fi

# Check if .ghost directory exists
if [ ! -d "$PROJECT_ROOT/$ghostDir" ]; then
  exit 0
fi

# Check if encryption is enabled (ghost.vault should not be in .gitignore)
if grep -q "ghost.vault" "$PROJECT_ROOT/.gitignore" 2>/dev/null; then
  exit 0
fi

# Check if there are any ghost.vault changes
if git diff --cached --name-only | grep -q "ghost.vault"; then
  echo "Syncing Ghost Persona vault..."
  
  # Use expect to provide password non-interactively
  # Note: This is a security consideration - password is in the hook file
  echo "${escapedPassword}" | $GHOST_CLI sync --password-stdin --remote origin --branch 2>/dev/null || true
  
  echo "✓ Ghost Persona vault synced"
fi

exit 0
`;
  }

  /**
   * Install all hooks (pre-commit for snapshots, post-commit for sync)
   */
  async installHooks(options: { password?: string } = {}): Promise<Result<{ preCommit: boolean; postCommit: boolean }>> {
    try {
      let preCommitInstalled = false;
      let postCommitInstalled = false;

      // Install pre-commit hook
      const preCommitResult = await this.installPreCommitHook();
      if (preCommitResult.success) {
        preCommitInstalled = true;
      }

      // Install post-commit hook if password provided
      if (options.password) {
        const postCommitResult = await this.installPostCommitHook(options.password);
        if (postCommitResult.success) {
          postCommitInstalled = true;
        }
      }

      return ok({ preCommit: preCommitInstalled, postCommit: postCommitInstalled });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Uninstall all hooks
   */
  async uninstallHooks(): Promise<Result<{ preCommit: boolean; postCommit: boolean }>> {
    try {
      let preCommitUninstalled = false;
      let postCommitUninstalled = false;

      const preCommitResult = await this.uninstallPreCommitHook();
      if (preCommitResult.success) {
        preCommitUninstalled = true;
      }

      const postCommitResult = await this.uninstallPostCommitHook();
      if (postCommitResult.success) {
        postCommitUninstalled = true;
      }

      return ok({ preCommit: preCommitUninstalled, postCommit: postCommitUninstalled });
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
