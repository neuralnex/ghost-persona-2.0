import * as vscode from 'vscode';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { EncryptionService, validatePassword } from '@ghost-persona/encryption';
import { GhostConfig, DEFAULT_CONFIG, GHOST_DIR } from '@ghost-persona/shared';
import { GhostStatusBar } from '../providers/statusBar.js';
import { MemoryTreeProvider } from '../providers/memoryTree.js';
import path from 'path';
import { needsChunking, calculateChecksum } from '../utils/ipc-chunking';

interface CommandContext {
  context: vscode.ExtensionContext;
  workspaceRoot: string;
  getEngine: () => MemoryEngine | undefined;
  setEngine: (e: MemoryEngine) => void;
  statusBar: GhostStatusBar;
  memoryTree: MemoryTreeProvider;
  startWatching: () => Promise<void>;
  stopWatching: () => Promise<void>;
}

export function registerCommands(ctx: CommandContext): vscode.Disposable[] {
  const { workspaceRoot, getEngine, setEngine, statusBar, memoryTree, startWatching, stopWatching } = ctx;

  return [
    // ── Init ────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.init', async () => {
      const projectName = await vscode.window.showInputBox({
        prompt: 'Project name',
        value: path.basename(workspaceRoot),
      });

      if (!projectName) return;

      const config: GhostConfig = {
        ...DEFAULT_CONFIG,
        projectName,
        projectRoot: workspaceRoot,
        ghostDir: path.join(workspaceRoot, GHOST_DIR),
      };

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ghost Persona: Initializing...' },
        async () => {
          const newEngine = new MemoryEngine(config);
          const result = await newEngine.initialize();

          if (!result.success) {
            vscode.window.showErrorMessage(`Ghost init failed: ${result.error.message}`);
            return;
          }

          setEngine(newEngine);
          statusBar.setActive();
          memoryTree.refresh();

          vscode.window.showInformationMessage(
            `👻 Ghost Persona initialized for "${projectName}"`,
            'Start Watching'
          ).then((choice) => {
            if (choice === 'Start Watching') {
              vscode.commands.executeCommand('ghost.watch');
            }
          });
        }
      );
    }),

    // ── Watch ────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.watch', async () => {
      await startWatching();
      vscode.window.setStatusBarMessage('$(eye) Ghost Persona: Watching...', 3000);
    }),

    // ── Stop Watch ───────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.stopWatch', async () => {
      await stopWatching();
      vscode.window.setStatusBarMessage('Ghost Persona: Stopped watching', 3000);
    }),

    // ── View Memory ──────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.viewMemory', async () => {
      const ghostDir = path.join(workspaceRoot, GHOST_DIR);
      const uri = vscode.Uri.file(path.join(ghostDir, 'project.md'));
      await vscode.commands.executeCommand('vscode.open', uri);
    }),

    // ── Generate Context ─────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.generateContext', async () => {
      memoryTree.refresh();
      vscode.window.setStatusBarMessage('$(check) Ghost: Memory refreshed', 3000);
    }),

    // ── Generate Agent Brief ─────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.generateAgentBrief', async () => {
      const engine = getEngine();
      if (!engine) {
        vscode.window.showErrorMessage('Ghost Persona is not initialized. Run Ghost: Initialize Project first.');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ghost: Generating AI brief...' },
        async () => {
          const brief = await engine.generateBrief();

          // Check if brief is too large for clipboard
          // VS Code clipboard also has size limits, so warn user for very large briefs
          const briefSizeKB = Buffer.byteLength(brief, 'utf-8') / 1024;
          
          if (briefSizeKB > 1024) {
            // Brief is larger than 1MB - warn user
            const choice = await vscode.window.showWarningMessage(
              `👻 AI brief is large (${briefSizeKB.toFixed(1)}KB). Opening in editor.`,
              { modal: false },
              'Open Anyway'
            );
            
            if (choice !== 'Open Anyway') {
              return;
            }
          }

          // Open brief in new editor
          // VS Code document API has its own limits, but handles large files better
          const doc = await vscode.workspace.openTextDocument({
            content: brief,
            language: 'markdown',
          });
          await vscode.window.showTextDocument(doc);

          vscode.window.showInformationMessage(
            `👻 AI brief generated (${briefSizeKB.toFixed(1)}KB) — copy and paste into your agent`,
            'Copy to Clipboard'
          ).then(async (choice) => {
            if (choice === 'Copy to Clipboard') {
              // For very large briefs, show a warning
              if (briefSizeKB > 512) {
                vscode.window.showWarningMessage(
                  `Brief is ${briefSizeKB.toFixed(1)}KB. Some clipboards may not support this size.`
                );
              }
              await vscode.env.clipboard.writeText(brief);
              vscode.window.setStatusBarMessage('$(check) Brief copied to clipboard', 3000);
            }
          });
        }
      );
    }),

    // ── Create Snapshot ───────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.createSnapshot', async () => {
      const engine = getEngine();
      if (!engine) {
        vscode.window.showErrorMessage('Ghost Persona is not initialized.');
        return;
      }

      const currentGoal = await vscode.window.showInputBox({
        prompt: 'Current development goal (optional)',
        placeHolder: 'e.g. Implementing authentication flow',
      });

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ghost: Creating snapshot...' },
        async () => {
          const result = await engine.createSnapshot({ currentGoal: currentGoal || undefined });

          if (!result.success) {
            vscode.window.showErrorMessage(`Snapshot failed: ${result.error.message}`);
            return;
          }

          vscode.window.showInformationMessage(
            `👻 Snapshot created: ${result.data.id.slice(0, 8)}`
          );
          memoryTree.refresh();
        }
      );
    }),

    // ── Encrypt Vault ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.encryptVault', async () => {
      const password = await vscode.window.showInputBox({
        prompt: 'Enter vault encryption password',
        password: true,
      });

      if (!password) return;

      const confirm = await vscode.window.showInputBox({
        prompt: 'Confirm password',
        password: true,
      });

      if (password !== confirm) {
        vscode.window.showErrorMessage('Passwords do not match');
        return;
      }

      const check = validatePassword(password);
      if (!check.valid) {
        vscode.window.showErrorMessage(check.message ?? 'Invalid password');
        return;
      }

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ghost: Encrypting vault...' },
        async () => {
          const encryption = new EncryptionService(workspaceRoot);
          await encryption.encrypt(password);
          vscode.window.showInformationMessage('👻 Vault encrypted → ghost.vault');
        }
      );
    }),

    // ── Restore Vault ─────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.restoreVault', async () => {
      const password = await vscode.window.showInputBox({
        prompt: 'Enter vault password to restore memory',
        password: true,
      });

      if (!password) return;

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Ghost: Restoring vault...' },
        async () => {
          const encryption = new EncryptionService(workspaceRoot);
          await encryption.decrypt(password);
          memoryTree.refresh();
          vscode.window.showInformationMessage('👻 Memory restored from vault');
        }
      );
    }),

    // ── Search ────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.search', async () => {
      const engine = getEngine();
      if (!engine) {
        vscode.window.showErrorMessage('Ghost Persona is not initialized.');
        return;
      }

      const query = await vscode.window.showInputBox({
        prompt: 'Search project memory',
        placeHolder: 'e.g. authentication, database, deployment',
      });

      if (!query) return;

      const results = await engine.search(query);

      if (results.length === 0) {
        vscode.window.showInformationMessage(`No results found for "${query}"`);
        return;
      }

      const selected = await vscode.window.showQuickPick(
        results.map((r) => ({ label: r, description: '' })),
        { title: `Ghost Search: "${query}"`, placeHolder: 'Select a result to view' }
      );

      if (selected) {
        vscode.window.showInformationMessage(selected.label);
      }
    }),

    // ── Refresh ────────────────────────────────────────────────────────────────
    vscode.commands.registerCommand('ghost.refreshMemory', () => {
      memoryTree.refresh();
    }),
  ];
}
