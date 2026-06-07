/**
 * Lightweight metadata store using a JSON file.
 * Replaces better-sqlite3 (which requires native compilation) with a
 * portable pure-JS solution. Metadata volume is small so file-based
 * persistence is perfectly adequate.
 */
import fs from 'fs/promises';
import path from 'path';
import { FileChangeBatch, ProjectSnapshot } from '@ghost-persona/shared';
import { ProcessedContext } from '@ghost-persona/context-processor';

interface DbRow {
  [key: string]: unknown;
}

interface DbData {
  metadata: Record<string, unknown>;
  batches: DbRow[];
  snapshots: DbRow[];
}

export class MetadataStore {
  private readonly dbPath: string;
  private data: DbData = { metadata: {}, batches: [], snapshots: [] };
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.dbPath, 'utf-8');
      this.data = JSON.parse(raw) as DbData;
    } catch {
      // First run — start fresh
      this.data = { metadata: {}, batches: [], snapshots: [] };
    }
  }

  upsertMetadata(entries: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(entries)) {
      this.data.metadata[k] = v;
    }
    this.scheduleSave();
  }

  incrementMetric(key: string, amount = 1): void {
    const current = (this.data.metadata[key] as number) ?? 0;
    this.data.metadata[key] = current + amount;
    this.scheduleSave();
  }

  recordBatch(batch: FileChangeBatch, context: ProcessedContext): void {
    this.data.batches.unshift({
      id: batch.id,
      startTime: batch.startTime.toISOString(),
      endTime: batch.endTime.toISOString(),
      eventCount: batch.events.length,
      summary: context.summary,
      changeType: context.changeType,
      affectedAreas: context.affectedAreas,
    });
    // Keep last 500 batches
    if (this.data.batches.length > 500) this.data.batches.length = 500;
    this.scheduleSave();
  }

  recordSnapshot(snapshot: ProjectSnapshot): void {
    this.data.snapshots.unshift({
      id: snapshot.id,
      date: snapshot.date.toISOString(),
      commit: snapshot.commit ?? null,
      branch: snapshot.branch ?? null,
      currentGoal: snapshot.currentGoal,
    });
    this.scheduleSave();
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), 2000);
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    this.dirty = false;
  }

  close(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      // Synchronous write on close — best effort
      try {
        const { writeFileSync } = require('fs');
        if (this.dirty) writeFileSync(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
      } catch { /* ignore */ }
    }
  }
}
