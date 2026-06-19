import * as vscode from 'vscode';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { GhostStatusBar } from './providers/statusBar.js';
import { MemoryTreeProvider } from './providers/memoryTree.js';
import { registerCommands } from './commands/index.js';
import { GHOST_DIR } from '@ghost-persona/shared';
import path from 'path';
import fs from 'fs';

// Import chunked streaming utilities for IPC message serialization limits
import {
  ChunkedSender,
  ChunkedReceiver,
  chunkData,
  reassembleChunks,
  needsChunking,
  DEFAULT_CHUNK_SIZE
} from './utils/ipc-chunking.js';

let engine: MemoryEngine | undefined;
let statusBar: GhostStatusBar | undefined;
let memoryTree: MemoryTreeProvider | undefined;

// Chunked streaming state for large memory transfers
let chunkedSender: ChunkedSender | undefined;
let chunkedReceiver: ChunkedReceiver | undefined;

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

/**
 * Safely send large data through VS Code extension context
 * Uses chunked streaming to avoid hitting the 8MB IPC message size limit
 */
export async function safeSendLargeData<T>(
  data: T,
  serializer: (d: T) => string = JSON.stringify
): Promise<string> {
  const serialized = serializer(data);
  
  if (!needsChunking(serialized)) {
    return serialized;
  }
  
  // For very large data, use chunked transfer
  const chunks = chunkData(serialized, DEFAULT_CHUNK_SIZE);
  const transferId = chunks[0].transferId;
  
  // In a real implementation, these chunks would be sent via a message bus
  // For now, we'll return a marker that indicates chunking is needed
  return JSON.stringify({
    __chunked__: true,
    transferId,
    totalChunks: chunks.length,
    checksum: chunks[0].checksum
  });
}

/**
 * Initialize chunked streaming for large memory file transfers
 */
function initializeChunkedStreaming() {
  // Create sender for outgoing large messages
  chunkedSender = new ChunkedSender(async (chunk) => {
    // In production, this would send via VS Code's message API
    // For now, just log
    console.log(`Sending chunk ${chunk.sequence}/${chunk.totalChunks} for transfer ${chunk.transferId}`);
    return true;
  });
  
  // Create receiver for incoming chunked messages
  chunkedReceiver = new ChunkedReceiver((data, metadata) => {
    console.log(`Received complete chunked transfer: ${data.length} bytes`);
    // Handle reassembled data
  });
}

// Initialize chunked streaming on extension load
initializeChunkedStreaming();

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
