import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { EncryptionMetadata, GHOST_DIR, VAULT_FILE } from '@ghost-persona/shared';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 310_000; // PBKDF2 iterations (NIST recommendation)
const DIGEST = 'sha512';
const VAULT_VERSION = '1.0.0';

export interface VaultPayload {
  metadata: EncryptionMetadata;
  files: Record<string, string>; // relativePath -> content
}

export class EncryptionService {
  private readonly projectRoot: string;
  private readonly ghostDir: string;
  private readonly vaultPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.ghostDir = path.join(projectRoot, GHOST_DIR);
    this.vaultPath = path.join(projectRoot, VAULT_FILE);
  }

  // ─── Key Derivation ────────────────────────────────────────────────────────

  private deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(
        password,
        salt,
        ITERATIONS,
        KEY_LENGTH,
        DIGEST,
        (err, key) => {
          if (err) reject(err);
          else resolve(key);
        }
      );
    });
  }

  // ─── Encryption ────────────────────────────────────────────────────────────

  async encrypt(password: string): Promise<string> {
    // Collect all files from .ghost/
    const files = await this.collectGhostFiles();

    const plaintext = JSON.stringify({ files, createdAt: new Date().toISOString() });

    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);
    const key = await this.deriveKey(password, salt);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    const metadata: EncryptionMetadata = {
      algorithm: ALGORITHM,
      iterations: ITERATIONS,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      createdAt: new Date(),
      version: VAULT_VERSION,
    };

    const vault = {
      metadata,
      payload: encrypted.toString('base64'),
    };

    const vaultContent = JSON.stringify(vault, null, 2);
    await fs.writeFile(this.vaultPath, vaultContent, 'utf-8');

    return this.vaultPath;
  }

  // ─── Decryption ────────────────────────────────────────────────────────────

  async decrypt(password: string): Promise<void> {
    const vaultContent = await fs.readFile(this.vaultPath, 'utf-8');
    const vault = JSON.parse(vaultContent) as {
      metadata: EncryptionMetadata;
      payload: string;
    };

    const { metadata } = vault;

    if (metadata.version !== VAULT_VERSION) {
      throw new Error(`Unsupported vault version: ${metadata.version}`);
    }

    const salt = Buffer.from(metadata.salt, 'hex');
    const iv = Buffer.from(metadata.iv, 'hex');
    const tag = Buffer.from(metadata.tag, 'hex');
    const key = await this.deriveKey(password, salt);

    const encryptedData = Buffer.from(vault.payload, 'base64');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    let decrypted: string;
    try {
      decrypted = decipher.update(encryptedData).toString('utf-8') + decipher.final('utf-8');
    } catch {
      throw new Error('Decryption failed: invalid password or corrupted vault');
    }

    const { files } = JSON.parse(decrypted) as {
      files: Record<string, string>;
      createdAt: string;
    };

    // Restore files
    await this.restoreGhostFiles(files);
  }

  // ─── Vault Management ──────────────────────────────────────────────────────

  async vaultExists(): Promise<boolean> {
    try {
      await fs.access(this.vaultPath);
      return true;
    } catch {
      return false;
    }
  }

  async getVaultMetadata(): Promise<EncryptionMetadata | null> {
    try {
      const content = await fs.readFile(this.vaultPath, 'utf-8');
      const vault = JSON.parse(content) as { metadata: EncryptionMetadata };
      return vault.metadata;
    } catch {
      return null;
    }
  }

  // ─── File Helpers ──────────────────────────────────────────────────────────

  private async collectGhostFiles(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    await this.collectDir(this.ghostDir, this.ghostDir, files);
    return files;
  }

  private async collectDir(
    baseDir: string,
    currentDir: string,
    files: Record<string, string>
  ): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        await this.collectDir(baseDir, fullPath, files);
      } else if (entry.isFile()) {
        try {
          files[relativePath] = await fs.readFile(fullPath, 'utf-8');
        } catch {
          // Skip binary files or unreadable files
        }
      }
    }
  }

  private async restoreGhostFiles(files: Record<string, string>): Promise<void> {
    await fs.mkdir(this.ghostDir, { recursive: true });

    for (const [relativePath, content] of Object.entries(files)) {
      const fullPath = path.join(this.ghostDir, relativePath);
      const dir = path.dirname(fullPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content, 'utf-8');
    }
  }
}

// ─── Password Validation ──────────────────────────────────────────────────────

export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters' };
  }
  return { valid: true };
}
