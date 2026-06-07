import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EncryptionService, validatePassword } from '../index.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('EncryptionService', () => {
  let tmpDir: string;
  let ghostDir: string;
  let service: EncryptionService;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ghost-test-'));
    ghostDir = path.join(tmpDir, '.ghost');
    await fs.mkdir(ghostDir, { recursive: true });

    // Seed some memory files
    await fs.writeFile(path.join(ghostDir, 'project.md'), '# Test Project\nSome content.');
    await fs.writeFile(path.join(ghostDir, 'decisions.md'), '# Decisions\nWe chose Clerk.');
    await fs.writeFile(path.join(ghostDir, 'architecture.md'), '# Architecture\nNode.js monorepo.');

    service = new EncryptionService(tmpDir);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('validatePassword', () => {
    it('rejects short passwords', () => {
      expect(validatePassword('short').valid).toBe(false);
      expect(validatePassword('1234567').valid).toBe(false);
    });

    it('accepts passwords of 8+ characters', () => {
      expect(validatePassword('password').valid).toBe(true);
      expect(validatePassword('a-very-long-secure-passphrase-2026').valid).toBe(true);
    });
  });

  describe('encrypt', () => {
    it('creates a ghost.vault file', async () => {
      await service.encrypt('testpassword');
      const vaultPath = path.join(tmpDir, 'ghost.vault');
      await expect(fs.access(vaultPath)).resolves.toBeUndefined();
    });

    it('vault contains expected metadata fields', async () => {
      await service.encrypt('testpassword');
      const vaultRaw = await fs.readFile(path.join(tmpDir, 'ghost.vault'), 'utf-8');
      const vault = JSON.parse(vaultRaw);

      expect(vault.metadata).toBeDefined();
      expect(vault.metadata.algorithm).toBe('aes-256-gcm');
      expect(vault.metadata.salt).toBeTruthy();
      expect(vault.metadata.iv).toBeTruthy();
      expect(vault.metadata.tag).toBeTruthy();
      expect(vault.metadata.version).toBe('1.0.0');
      expect(vault.payload).toBeTruthy();
    });

    it('produces different ciphertext on each call (random IV)', async () => {
      await service.encrypt('testpassword');
      const v1 = await fs.readFile(path.join(tmpDir, 'ghost.vault'), 'utf-8');
      await service.encrypt('testpassword');
      const v2 = await fs.readFile(path.join(tmpDir, 'ghost.vault'), 'utf-8');
      const parsed1 = JSON.parse(v1);
      const parsed2 = JSON.parse(v2);
      expect(parsed1.metadata.iv).not.toBe(parsed2.metadata.iv);
      expect(parsed1.payload).not.toBe(parsed2.payload);
    });
  });

  describe('decrypt', () => {
    it('restores files after encrypt → decrypt round-trip', async () => {
      const original = await fs.readFile(path.join(ghostDir, 'project.md'), 'utf-8');

      await service.encrypt('mySecurePass!');

      // Remove the .ghost directory to simulate a fresh machine
      await fs.rm(ghostDir, { recursive: true });

      await service.decrypt('mySecurePass!');

      const restored = await fs.readFile(path.join(ghostDir, 'project.md'), 'utf-8');
      expect(restored).toBe(original);
    });

    it('restores all memory files', async () => {
      await service.encrypt('mySecurePass!');
      await fs.rm(ghostDir, { recursive: true });
      await service.decrypt('mySecurePass!');

      const files = await fs.readdir(ghostDir);
      expect(files).toContain('project.md');
      expect(files).toContain('decisions.md');
      expect(files).toContain('architecture.md');
    });

    it('throws on wrong password', async () => {
      await service.encrypt('correctPassword');
      await expect(service.decrypt('wrongPassword')).rejects.toThrow(
        /Decryption failed|invalid password/i
      );
    });

    it('throws when vault does not exist', async () => {
      await expect(service.decrypt('anyPassword')).rejects.toThrow();
    });
  });

  describe('vaultExists', () => {
    it('returns false when no vault present', async () => {
      expect(await service.vaultExists()).toBe(false);
    });

    it('returns true after encryption', async () => {
      await service.encrypt('password123');
      expect(await service.vaultExists()).toBe(true);
    });
  });

  describe('getVaultMetadata', () => {
    it('returns null when no vault', async () => {
      expect(await service.getVaultMetadata()).toBeNull();
    });

    it('returns metadata after encryption', async () => {
      await service.encrypt('password123');
      const meta = await service.getVaultMetadata();
      expect(meta).not.toBeNull();
      expect(meta?.algorithm).toBe('aes-256-gcm');
    });
  });
});
