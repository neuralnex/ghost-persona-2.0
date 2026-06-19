/**
 * Cross-process file locking mechanism
 * 
 * Implements lightweight file-lock using lockfile mechanism to prevent
 * race conditions between file-watcher, markdown-generator, and encryption cycles.
 * Uses exclusive locks for writes and shared locks for reads.
 */

import fs from 'fs/promises';
import path from 'path';
import { setTimeout as sleep } from 'timers/promises';

const LOCK_DIR = '.ghost-locks';
const LOCK_TIMEOUT = 10000; // 10 seconds max wait for lock
const LOCK_POLL_INTERVAL = 100; // Check every 100ms

export type LockMode = 'exclusive' | 'shared';

export interface LockFile {
  path: string;
  mode: LockMode;
  pid: number;
  timestamp: number;
  resource: string;
}

export class FileLockManager {
  private readonly lockDir: string;
  private readonly pid: number;
  private activeLocks: Map<string, LockFile> = new Map();

  constructor(projectRoot: string) {
    this.lockDir = path.join(projectRoot, LOCK_DIR);
    this.pid = process.pid;
  }

  /**
   * Initialize the lock directory
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.lockDir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }

  /**
   * Acquire a lock on a resource
   * @param resource The resource to lock (e.g., file path)
   * @param mode 'exclusive' for write operations, 'shared' for read operations
   * @param timeout Maximum time to wait for lock in milliseconds
   */
  async acquire(resource: string, mode: LockMode = 'exclusive', timeout: number = LOCK_TIMEOUT): Promise<boolean> {
    const lockFilePath = this.getLockFilePath(resource);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        // Check if we can acquire the lock
        const existingLock = await this.readLockFile(lockFilePath);
        
        if (existingLock) {
          // If we already hold this lock, return true
          if (existingLock.pid === this.pid) {
            return true;
          }
          
          // If we want exclusive but there's any lock, wait
          if (mode === 'exclusive') {
            await sleep(LOCK_POLL_INTERVAL);
            continue;
          }
          
          // If we want shared but there's an exclusive lock, wait
          if (existingLock.mode === 'exclusive') {
            await sleep(LOCK_POLL_INTERVAL);
            continue;
          }
        }

        // Create the lock file
        const lockFile: LockFile = {
          path: lockFilePath,
          mode,
          pid: this.pid,
          timestamp: Date.now(),
          resource,
        };

        await fs.writeFile(lockFilePath, JSON.stringify(lockFile, null, 2), 'utf-8');
        this.activeLocks.set(resource, lockFile);
        return true;
      } catch {
        await sleep(LOCK_POLL_INTERVAL);
      }
    }

    return false; // Timeout
  }

  /**
   * Release a lock on a resource
   * @param resource The resource to unlock
   */
  async release(resource: string): Promise<void> {
    const lockFilePath = this.getLockFilePath(resource);
    const lockFile = this.activeLocks.get(resource);

    // Only release if we own the lock
    if (lockFile && lockFile.pid === this.pid) {
      try {
        await fs.unlink(lockFilePath);
      } catch {
        // Lock file might not exist
      }
      this.activeLocks.delete(resource);
    }
  }

  /**
   * Acquire exclusive lock (write lock)
   */
  async acquireExclusive(resource: string, timeout: number = LOCK_TIMEOUT): Promise<boolean> {
    return this.acquire(resource, 'exclusive', timeout);
  }

  /**
   * Acquire shared lock (read lock)
   */
  async acquireShared(resource: string, timeout: number = LOCK_TIMEOUT): Promise<boolean> {
    return this.acquire(resource, 'shared', timeout);
  }

  /**
   * Release exclusive lock
   */
  async releaseExclusive(resource: string): Promise<void> {
    return this.release(resource);
  }

  /**
   * Release shared lock
   */
  async releaseShared(resource: string): Promise<void> {
    return this.release(resource);
  }

  /**
   * Check if a resource is currently locked
   */
  async isLocked(resource: string): Promise<boolean> {
    const lockFilePath = this.getLockFilePath(resource);
    const lockFile = await this.readLockFile(lockFilePath);
    return lockFile !== null;
  }

  /**
   * Clean up stale locks (from crashed processes)
   */
  async cleanupStaleLocks(): Promise<void> {
    try {
      const entries = await fs.readdir(this.lockDir, { withFileTypes: true });
      const currentPid = process.pid;

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.lock')) {
          const lockFilePath = path.join(this.lockDir, entry.name);
          const lockFile = await this.readLockFile(lockFilePath);
          
          if (lockFile && lockFile.pid !== currentPid) {
            // Check if the process is still running
            try {
              process.kill(lockFile.pid, 0); // Signal 0 checks if process exists
              // Process still exists, don't delete
            } catch {
              // Process doesn't exist, clean up stale lock
              try {
                await fs.unlink(lockFilePath);
              } catch {
                // Ignore
              }
            }
          }
        }
      }
    } catch {
      // Lock directory might not exist
    }
  }

  /**
   * Get the path for a lock file
   */
  private getLockFilePath(resource: string): string {
    // Sanitize the resource path to create a valid filename
    const sanitized = resource.replace(/[^a-zA-Z0-9\-_]/g, '_');
    return path.join(this.lockDir, `${sanitized}.lock`);
  }

  /**
   * Read a lock file if it exists
   */
  private async readLockFile(lockFilePath: string): Promise<LockFile | null> {
    try {
      const content = await fs.readFile(lockFilePath, 'utf-8');
      const lockFile = JSON.parse(content) as LockFile;
      
      // Check if lock is stale (older than 5 minutes)
      if (Date.now() - lockFile.timestamp > 300000) {
        return null; // Consider it stale
      }
      
      return lockFile;
    } catch {
      return null; // Lock file doesn't exist or is invalid
    }
  }

  /**
   * Clean up all locks held by this process
   */
  async cleanup(): Promise<void> {
    for (const [resource] of this.activeLocks) {
      await this.release(resource);
    }
    this.activeLocks.clear();
  }
}

export function createLockManager(projectRoot: string): FileLockManager {
  return new FileLockManager(projectRoot);
}
