import chokidar, { FSWatcher } from 'chokidar';
import path from 'path';
import micromatch from 'micromatch';
import { EventEmitter } from 'events';
import {
  FileChangeEvent,
  FileChangeBatch,
  GhostConfig,
  DEFAULT_IGNORE_PATTERNS,
} from '@ghost-persona/shared';
import { randomUUID } from 'crypto';

export interface FileWatcherEvents {
  'batch': (batch: FileChangeBatch) => void;
  'change': (event: FileChangeEvent) => void;
  'error': (error: Error) => void;
  'ready': () => void;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private pendingEvents: FileChangeEvent[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private batchStartTime: Date = new Date();
  private readonly projectRoot: string;
  private readonly ignorePatterns: string[];
  private readonly debounceMs: number;
  private circuitBreakerTripped = false;
  private circuitBreakerThreshold = 100;
  private consecutiveEventCount = 0;

  constructor(config: Pick<GhostConfig, 'projectRoot' | 'ignorePatterns' | 'debounceMs'> & { circuitBreakerThreshold?: number }) {
    super();
    this.projectRoot = config.projectRoot;
    this.ignorePatterns = config.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
    this.debounceMs = config.debounceMs ?? 1500;
    this.circuitBreakerThreshold = config.circuitBreakerThreshold ?? 100;
  }

  start(): void {
    if (this.watcher) {
      throw new Error('FileWatcher is already running');
    }

    this.watcher = chokidar.watch(this.projectRoot, {
      ignored: (filePath: string) => this.shouldIgnore(filePath),
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    this.watcher
      .on('add', (filePath) => this.handleEvent('created', filePath))
      .on('unlink', (filePath) => this.handleEvent('deleted', filePath))
      .on('change', (filePath) => this.handleEvent('modified', filePath))
      .on('addDir', (filePath) => this.handleEvent('created', filePath))
      .on('unlinkDir', (filePath) => this.handleEvent('deleted', filePath))
      .on('rename', (oldPath, newPath) => this.handleRename(oldPath, newPath))
      .on('error', (error) => this.emit('error', error))
      .on('ready', () => this.emit('ready'));
  }

  stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.flushBatch();
    }
    if (this.watcher) {
      return this.watcher.close().then(() => {
        this.watcher = null;
      });
    }
    return Promise.resolve();
  }

  private shouldIgnore(filePath: string): boolean {
    const relative = path.relative(this.projectRoot, filePath);
    if (!relative) return false;

    const parts = relative.split(path.sep);

    for (const pattern of this.ignorePatterns) {
      if (micromatch.isMatch(relative, pattern, { dot: true })) return true;
      if (parts.some((p) => micromatch.isMatch(p, pattern, { dot: true }))) return true;
    }

    return false;
  }

  private handleEvent(type: FileChangeEvent['type'], filePath: string): void {
    // Circuit breaker: pause watching if we hit the threshold
    if (this.circuitBreakerTripped) {
      return;
    }

    const event: FileChangeEvent = {
      type,
      path: filePath,
      relativePath: path.relative(this.projectRoot, filePath),
      timestamp: new Date(),
    };

    if (this.pendingEvents.length === 0) {
      this.batchStartTime = new Date();
    }

    this.pendingEvents.push(event);
    this.consecutiveEventCount++;
    this.emit('change', event);
    
    // Check circuit breaker threshold
    if (this.consecutiveEventCount >= this.circuitBreakerThreshold) {
      this.circuitBreakerTripped = true;
      console.warn(`FileWatcher circuit breaker tripped after ${this.circuitBreakerThreshold} consecutive events. Pausing until queue drains.`);
    }
    
    this.scheduleBatchFlush();
  }

  private handleRename(oldPath: string, newPath: string): void {
    // Circuit breaker: pause watching if we hit the threshold
    if (this.circuitBreakerTripped) {
      return;
    }

    const event: FileChangeEvent = {
      type: 'renamed',
      path: newPath,
      oldPath,
      relativePath: path.relative(this.projectRoot, newPath),
      timestamp: new Date(),
    };

    if (this.pendingEvents.length === 0) {
      this.batchStartTime = new Date();
    }

    this.pendingEvents.push(event);
    this.consecutiveEventCount++;
    this.emit('change', event);
    
    // Check circuit breaker threshold
    if (this.consecutiveEventCount >= this.circuitBreakerThreshold) {
      this.circuitBreakerTripped = true;
      console.warn(`FileWatcher circuit breaker tripped after ${this.circuitBreakerThreshold} consecutive events. Pausing until queue drains.`);
    }
    
    this.scheduleBatchFlush();
  }

  private scheduleBatchFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => this.flushBatch(), this.debounceMs);
  }

  private flushBatch(): void {
    if (this.pendingEvents.length === 0) return;

    const batch: FileChangeBatch = {
      id: randomUUID(),
      events: [...this.pendingEvents],
      startTime: this.batchStartTime,
      endTime: new Date(),
    };

    this.pendingEvents = [];
    this.debounceTimer = null;
    
    // Reset circuit breaker when queue drains
    if (this.circuitBreakerTripped) {
      this.circuitBreakerTripped = false;
      this.consecutiveEventCount = 0;
      console.log('FileWatcher circuit breaker reset. Resuming event processing.');
    }

    this.emit('batch', batch);
  }

  isRunning(): boolean {
    return this.watcher !== null;
  }

  /**
   * Manually reset the circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreakerTripped = false;
    this.consecutiveEventCount = 0;
  }

  /**
   * Check if circuit breaker is currently tripped
   */
  isCircuitBreakerTripped(): boolean {
    return this.circuitBreakerTripped;
  }
}
