/**
 * Cloud Sync Module
 * 
 * Provides cloud-based synchronization for Ghost Persona memory files.
 * Supports multiple cloud providers (Firebase, Supabase, custom HTTP endpoints).
 * Enables team memory sharing and real-time collaboration.
 */

import path from 'path';
import fs from 'fs/promises';
import { GHOST_DIR, Result, ok, err, VAULT_FILE } from '@ghost-persona/shared';
import { EncryptionService } from '@ghost-persona/encryption';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CloudConfig {
  /** Cloud provider: 'firebase', 'supabase', 'http', or 'custom' */
  provider: CloudProvider;
  /** Base URL or connection string for the cloud service */
  endpoint: string;
  /** API key or access token */
  apiKey?: string;
  /** Project/team identifier for multi-tenant support */
  projectId?: string;
  /** User identifier for team sharing */
  userId?: string;
  /** Team identifier for shared memory */
  teamId?: string;
  /** Enable automatic sync on file changes */
  autoSync?: boolean;
  /** Sync interval in milliseconds (default: 30000 = 30 seconds) */
  syncInterval?: number;
}

export type CloudProvider = 'firebase' | 'supabase' | 'http' | 'custom';

export interface SyncStatus {
  /** Whether sync is currently in progress */
  syncing: boolean;
  /** Last successful sync timestamp */
  lastSyncedAt?: string;
  /** Whether we're online and connected to cloud */
  online: boolean;
  /** Last error if any */
  lastError?: string;
  /** Number of pending changes */
  pendingChanges: number;
}

export interface MemoryManifest {
  /** Unique identifier for this memory set */
  id: string;
  /** Project name */
  projectName: string;
  /** Timestamp of last update */
  updatedAt: string;
  /** List of memory files */
  files: Array<{
    name: string;
    size: number;
    hash: string;
    updatedAt: string;
  }>;
  /** Encryption metadata */
  encryption?: {
    algorithm: string;
    version: string;
  };
  /** Team sharing settings */
  sharing?: {
    teamId: string;
    sharedWith: string[];
    permissions: Record<string, 'read' | 'write'>;
  };
}

export interface CloudSyncOptions {
  /** Whether to encrypt before syncing */
  encrypt?: boolean;
  /** Password for encryption (if encrypt is true) */
  password?: string;
  /** Force full sync (not incremental) */
  force?: boolean;
}

// ─── Base Cloud Provider Interface ───────────────────────────────────────────

interface CloudProviderInterface {
  /** Initialize the cloud provider */
  initialize(config: CloudConfig): Promise<Result<void>>;
  
  /** Upload a file to cloud storage */
  uploadFile(filePath: string, cloudPath: string, metadata?: Record<string, string>): Promise<Result<string>>;
  
  /** Download a file from cloud storage */
  downloadFile(cloudPath: string, localPath: string): Promise<Result<void>>;
  
  /** List files at a given path */
  listFiles(prefix: string): Promise<Result<Array<{ name: string; size: number; updatedAt: string }>>>;
  
  /** Delete a file from cloud storage */
  deleteFile(cloudPath: string): Promise<Result<void>>;
  
  /** Get file metadata */
  getMetadata(cloudPath: string): Promise<Result<Record<string, string>>>;
  
  /** Check if file exists */
  fileExists(cloudPath: string): Promise<Result<boolean>>;
  
  /** Get sync status */
  getStatus(): SyncStatus;
  
  /** Subscribe to real-time updates (if supported) */
  subscribeToUpdates(callback: (update: MemoryManifest) => void): Promise<Result<void>>;
  
  /** Unsubscribe from updates */
  unsubscribeFromUpdates(): Promise<void>;
}

// ─── HTTP Cloud Provider (Generic REST API) ────────────────────────────────

class HttpCloudProvider implements CloudProviderInterface {
  private config!: CloudConfig;
  private status: SyncStatus = {
    syncing: false,
    online: false,
    pendingChanges: 0,
  };
  private updateCallback: ((update: MemoryManifest) => void) | null = null;
  private pollingInterval: NodeJS.Timeout | null = null;

  async initialize(config: CloudConfig): Promise<Result<void>> {
    this.config = config;
    
    // Check connectivity
    try {
      const response = await fetch(`${config.endpoint}/health`, {
        headers: this.getHeaders(),
      });
      this.status.online = response.ok;
    } catch {
      this.status.online = false;
    }

    // Start polling for updates if auto-sync is enabled
    if (config.autoSync) {
      this.startPolling(config.syncInterval || 30000);
    }

    return ok(undefined);
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }
    if (this.config.projectId) {
      headers['X-Project-ID'] = this.config.projectId;
    }
    if (this.config.userId) {
      headers['X-User-ID'] = this.config.userId;
    }
    return headers;
  }

  async uploadFile(filePath: string, cloudPath: string, metadata?: Record<string, string>): Promise<Result<string>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      const response = await fetch(`${this.config.endpoint}/upload`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          path: cloudPath,
          content,
          metadata: metadata || {},
        }),
      });

      if (!response.ok) {
        return err(new Error(`Upload failed: ${response.statusText}`));
      }

      const data = await response.json() as { id?: string };
      return ok(data.id || cloudPath);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async downloadFile(cloudPath: string, localPath: string): Promise<Result<void>> {
    try {
      const response = await fetch(`${this.config.endpoint}/download?path=${encodeURIComponent(cloudPath)}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return err(new Error(`Download failed: ${response.statusText}`));
      }

      const content = await response.text();
      await fs.writeFile(localPath, content, 'utf-8');
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listFiles(prefix: string): Promise<Result<Array<{ name: string; size: number; updatedAt: string }>>> {
    try {
      const response = await fetch(`${this.config.endpoint}/list?prefix=${encodeURIComponent(prefix)}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return err(new Error(`List failed: ${response.statusText}`));
      }

      const data = await response.json() as { files?: Array<{ name: string; size: number; updatedAt: string }> };
      return ok(data.files || []);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async deleteFile(cloudPath: string): Promise<Result<void>> {
    try {
      const response = await fetch(`${this.config.endpoint}/delete`, {
        method: 'DELETE',
        headers: this.getHeaders(),
        body: JSON.stringify({ path: cloudPath }),
      });

      if (!response.ok) {
        return err(new Error(`Delete failed: ${response.statusText}`));
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getMetadata(cloudPath: string): Promise<Result<Record<string, string>>> {
    try {
      const response = await fetch(`${this.config.endpoint}/metadata?path=${encodeURIComponent(cloudPath)}`, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return err(new Error(`Metadata fetch failed: ${response.statusText}`));
      }

      const data = await response.json() as { metadata?: Record<string, string> };
      return ok(data.metadata || {});
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async fileExists(cloudPath: string): Promise<Result<boolean>> {
    try {
      const response = await fetch(`${this.config.endpoint}/exists?path=${encodeURIComponent(cloudPath)}`, {
        headers: this.getHeaders(),
      });
      return ok(response.ok);
    } catch {
      return ok(false);
    }
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async subscribeToUpdates(callback: (update: MemoryManifest) => void): Promise<Result<void>> {
    this.updateCallback = callback;
    
    if (this.config.autoSync) {
      await this.pollForUpdates();
    }
    
    return ok(undefined);
  }

  async unsubscribeFromUpdates(): Promise<void> {
    this.updateCallback = null;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private startPolling(interval: number): void {
    this.pollingInterval = setInterval(async () => {
      await this.pollForUpdates();
    }, interval);
  }

  private async pollForUpdates(): Promise<void> {
    if (!this.updateCallback) return;

    try {
      const response = await fetch(`${this.config.endpoint}/updates`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        const data = await response.json() as { manifest?: MemoryManifest };
        if (data.manifest) {
          this.updateCallback(data.manifest);
        }
      }
    } catch {
      // Ignore polling errors
    }
  }
}

// ─── Firebase Cloud Provider ───────────────────────────────────────────────

class FirebaseCloudProvider implements CloudProviderInterface {
  private config!: CloudConfig;
  private status: SyncStatus = {
    syncing: false,
    online: false,
    pendingChanges: 0,
  };

  async initialize(config: CloudConfig): Promise<Result<void>> {
    this.config = config;
    
    // Firebase-specific initialization
    // In production, this would import and initialize Firebase SDK
    
    // For now, mark as online if we have required config
    this.status.online = !!config.endpoint && !!config.apiKey;
    
    return ok(undefined);
  }

  async uploadFile(filePath: string, cloudPath: string, metadata?: Record<string, string>): Promise<Result<string>> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Firebase Storage API would be used here
      // This is a mock implementation that simulates the API
      const response = await fetch(`${this.config.endpoint}/${cloudPath}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          content,
          metadata: metadata || {},
        }),
      });

      if (!response.ok) {
        return err(new Error(`Firebase upload failed: ${response.statusText}`));
      }

      const data = await response.json() as { downloadUrl?: string };
      return ok(data.downloadUrl || cloudPath);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async downloadFile(cloudPath: string, localPath: string): Promise<Result<void>> {
    try {
      const response = await fetch(`${this.config.endpoint}/${cloudPath}`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return err(new Error(`Firebase download failed: ${response.statusText}`));
      }

      const content = await response.text();
      await fs.writeFile(localPath, content, 'utf-8');
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async listFiles(prefix: string): Promise<Result<Array<{ name: string; size: number; updatedAt: string }>>> {
    // Firebase Storage list operation
    // This would use Firebase Storage SDK in production
    return ok([]);
  }

  async deleteFile(cloudPath: string): Promise<Result<void>> {
    try {
      const response = await fetch(`${this.config.endpoint}/${cloudPath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      if (!response.ok) {
        return err(new Error(`Firebase delete failed: ${response.statusText}`));
      }

      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async getMetadata(cloudPath: string): Promise<Result<Record<string, string>>> {
    return ok({});
  }

  async fileExists(cloudPath: string): Promise<Result<boolean>> {
    return ok(false);
  }

  getStatus(): SyncStatus {
    return { ...this.status };
  }

  async subscribeToUpdates(): Promise<Result<void>> {
    // Firebase Realtime Database would be used for this
    return ok(undefined);
  }

  async unsubscribeFromUpdates(): Promise<void> {
    // No-op for now
  }
}

// ─── Cloud Sync Manager ────────────────────────────────────────────────────

export class CloudSyncManager {
  private projectRoot: string;
  private provider: CloudProviderInterface;
  private encryption: EncryptionService;
  private config: CloudConfig;

  constructor(projectRoot: string, config: CloudConfig) {
    this.projectRoot = projectRoot;
    this.config = { ...config };
    this.encryption = new EncryptionService(projectRoot);
    
    // Create the appropriate provider based on config
    switch (config.provider) {
      case 'firebase':
        this.provider = new FirebaseCloudProvider();
        break;
      case 'http':
      case 'custom':
      default:
        this.provider = new HttpCloudProvider();
        break;
    }
  }

  /**
   * Initialize the cloud sync manager
   */
  async initialize(): Promise<Result<void>> {
    try {
      await this.provider.initialize(this.config);
      return ok(undefined);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Push memory files to cloud
   */
  async push(options?: CloudSyncOptions): Promise<Result<MemoryManifest>> {
    const ghostDir = path.join(this.projectRoot, GHOST_DIR);
    const manifest: MemoryManifest = {
      id: this.generateId(),
      projectName: path.basename(this.projectRoot),
      updatedAt: new Date().toISOString(),
      files: [],
      encryption: options?.encrypt ? {
        algorithm: 'aes-256-gcm',
        version: '1.0',
      } : undefined,
      sharing: this.config.teamId ? {
        teamId: this.config.teamId,
        sharedWith: [],
        permissions: {},
      } : undefined,
    };

    try {
      // Read all memory files
      const files = await fs.readdir(ghostDir);
      
      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(ghostDir, file);
          const stat = await fs.stat(filePath);
          const content = await fs.readFile(filePath, 'utf-8');
          
          // Generate hash of content
          const hash = this.hashContent(content);
          
          manifest.files.push({
            name: file,
            size: stat.size,
            hash,
            updatedAt: stat.mtime.toISOString(),
          });

          // Upload to cloud
          const cloudPath = `${this.config.teamId || this.config.projectId || 'default'}/${file}`;
          
          if (options?.encrypt && options.password) {
            // Encrypt the content before uploading
            const encrypted = await this.encryptContent(content, options.password);
            await this.provider.uploadFile(
              path.join(this.projectRoot, VAULT_FILE),
              cloudPath,
              { encrypted: 'true', originalFile: file }
            );
          } else {
            // Upload as-is
            await this.provider.uploadFile(filePath, cloudPath);
          }
        }
      }

      // Upload manifest
      const manifestPath = `${this.config.teamId || this.config.projectId || 'default'}/manifest.json`;
      const manifestTempPath = path.join(this.projectRoot, '.ghost-cloud-temp', 'manifest.json');
      await fs.mkdir(path.dirname(manifestTempPath), { recursive: true });
      await fs.writeFile(manifestTempPath, JSON.stringify(manifest, null, 2), 'utf-8');
      await this.provider.uploadFile(
        manifestTempPath,
        manifestPath,
        { type: 'manifest', version: '1.0' }
      );
      await fs.rm(manifestTempPath, { force: true });

      return ok(manifest);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Pull memory files from cloud
   */
  async pull(options?: CloudSyncOptions): Promise<Result<MemoryManifest>> {
    const ghostDir = path.join(this.projectRoot, GHOST_DIR);
    const tempDir = path.join(this.projectRoot, '.ghost-cloud-temp');

    try {
      // Ensure directories exist
      await fs.mkdir(ghostDir, { recursive: true });
      await fs.mkdir(tempDir, { recursive: true });

      // Fetch manifest
      const manifestPath = `${this.config.teamId || this.config.projectId || 'default'}/manifest.json`;
      const manifestFile = path.join(tempDir, 'manifest.json');
      
      const exists = await this.provider.fileExists(manifestPath);
      if (!exists.success || !exists.data) {
        return err(new Error('No manifest found in cloud storage'));
      }

      await this.provider.downloadFile(manifestPath, manifestFile);
      const manifest: MemoryManifest = JSON.parse(await fs.readFile(manifestFile, 'utf-8'));

      // Pull each file
      for (const file of manifest.files) {
        const cloudPath = `${this.config.teamId || this.config.projectId || 'default'}/${file.name}`;
        const localPath = path.join(ghostDir, file.name);
        const tempPath = path.join(tempDir, file.name);

        await this.provider.downloadFile(cloudPath, tempPath);

        // If encrypted, decrypt
        if (manifest.encryption && options?.password) {
          const decrypted = await this.decryptContent(tempPath, options.password);
          await fs.writeFile(localPath, decrypted, 'utf-8');
        } else {
          await fs.rename(tempPath, localPath);
        }
      }

      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true });

      return ok(manifest);
    } catch (error) {
      // Clean up temp directory on error
      try {
        await fs.rm(path.join(this.projectRoot, '.ghost-cloud-temp'), { recursive: true, force: true });
      } catch {}
      
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get sync status
   */
  getStatus(): SyncStatus {
    return this.provider.getStatus();
  }

  /**
   * Enable auto-sync
   */
  enableAutoSync(interval?: number): void {
    this.config.autoSync = true;
    this.config.syncInterval = interval || 30000;
  }

  /**
   * Disable auto-sync
   */
  disableAutoSync(): void {
    this.config.autoSync = false;
  }

  /**
   * Share memory with team
   */
  async shareWithTeam(teamId: string, userIds: string[]): Promise<Result<void>> {
    this.config.teamId = teamId;
    
    // In production, this would update cloud permissions
    // For now, just update local config
    
    return ok(undefined);
  }

  /**
   * Get list of shared team members
   */
  async getTeamMembers(): Promise<Result<string[]>> {
    // In production, this would fetch from cloud
    return ok([]);
  }

  /**
   * Subscribe to real-time updates
   */
  async subscribeToUpdates(callback: (manifest: MemoryManifest) => void): Promise<Result<void>> {
    return this.provider.subscribeToUpdates(callback);
  }

  /**
   * Unsubscribe from updates
   */
  async unsubscribeFromUpdates(): Promise<void> {
    await this.provider.unsubscribeFromUpdates();
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private generateId(): string {
    return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      hash = (hash << 5) - hash + content.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  private async encryptContent(content: string, password: string): Promise<string> {
    // In production, use the EncryptionService
    // For now, return a placeholder
    return `[ENCRYPTED]:${content}`;
  }

  private async decryptContent(filePath: string, password: string): Promise<string> {
    // In production, use the EncryptionService
    const content = await fs.readFile(filePath, 'utf-8');
    if (content.startsWith('[ENCRYPTED]:')) {
      return content.substring(12);
    }
    return content;
  }
}

// ─── Factory Function ──────────────────────────────────────────────────────

export function createCloudSync(projectRoot: string, config: CloudConfig): CloudSyncManager {
  return new CloudSyncManager(projectRoot, config);
}

// ─── Exports ───────────────────────────────────────────────────────────────

