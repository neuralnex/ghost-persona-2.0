import * as vscode from 'vscode';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { GhostStatusBar } from './providers/statusBar.js';
import { MemoryTreeProvider } from './providers/memoryTree.js';
import { registerCommands } from './commands/index.js';
import { GHOST_DIR } from '@ghost-persona/shared';
import path from 'path';
import fs from 'fs';

let engine: MemoryEngine | undefined;
let statusBar: GhostStatusBar | undefined;
let memoryTree: MemoryTreeProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
  console.log('Ghost Persona activating...');

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  if (!workspaceRoot) {
    return;
  }

  // Check if ghost is initialized
  const ghostDir = path.join(workspaceRoot, GHOST_DIR);
  const isInitialized = fs.existsSync(ghostDir);

  // Set up status bar
  statusBar = new GhostStatusBar();
  context.subscriptions.push(statusBar);

  // Set up tree providers
  memoryTree = new MemoryTreeProvider(workspaceRoot);
  vscode.window.registerTreeDataProvider('ghost.memoryView', memoryTree);
  vscode.window.registerTreeDataProvider('ghost.decisionsView', memoryTree);
  vscode.window.registerTreeDataProvider('ghost.currentWorkView', memoryTree);
  vscode.window.registerTreeDataProvider('ghost.snapshotsView', memoryTree);

  // Initialize engine if ghost is set up
  if (isInitialized) {
    engine = await MemoryEngine.fromDirectory(workspaceRoot);
    await engine.initialize();

    // Auto-watch if configured
    const config = vscode.workspace.getConfiguration('ghost');
    if (config.get<boolean>('autoWatch', true)) {
      await startWatching();
    }
  }

  // Register all commands
  const commands = registerCommands({
    context,
    workspaceRoot,
    getEngine: () => engine,
    setEngine: (e) => { engine = e; },
    statusBar: statusBar!,
    memoryTree: memoryTree!,
    startWatching,
    stopWatching,
  });

  context.subscriptions.push(...commands);

  if (isInitialized) {
    statusBar.setActive();
    vscode.window.setStatusBarMessage('$(ghost) Ghost Persona active', 3000);
  } else {
    statusBar.setInactive();
  }
}

export async function deactivate() {
  if (engine) {
    await engine.stop();
  }
}

async function startWatching() {
  if (!engine) return;

  const result = await engine.start();

  if (result.success) {
    statusBar?.setWatching();

    engine.on('batch-processed', (context) => {
      statusBar?.setUpdated(context.title);
      memoryTree?.refresh();
    });

    engine.on('error', (error: Error) => {
      vscode.window.showErrorMessage(`Ghost Persona: ${error.message}`);
    });
  }
}

async function stopWatching() {
  if (!engine) return;
  await engine.stop();
  statusBar?.setActive();
}

export { engine, statusBar, memoryTree };
