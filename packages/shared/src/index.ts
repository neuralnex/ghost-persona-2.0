// ─── Core Types ──────────────────────────────────────────────────────────────

export interface GhostConfig {
  projectName: string;
  projectRoot: string;
  ghostDir: string;
  ignorePatterns: string[];
  debounceMs: number;
  summarization: 'rule-based' | 'llm';
  llmApiKey?: string;
  llmModel?: string;
  encryptionEnabled: boolean;
  syncEnabled: boolean;
  apiPort: number;
}

export interface FileChangeEvent {
  type: 'created' | 'deleted' | 'renamed' | 'modified';
  path: string;
  oldPath?: string; // for renames
  timestamp: Date;
  relativePath: string;
}

export interface FileChangeBatch {
  id: string;
  events: FileChangeEvent[];
  startTime: Date;
  endTime: Date;
  summary?: string;
}

export interface MemoryFile {
  name: MemoryFileName;
  path: string;
  content: string;
  lastUpdated: Date;
}

export type MemoryFileName =
  | 'project.md'
  | 'architecture.md'
  | 'decisions.md'
  | 'roadmap.md'
  | 'current-work.md'
  | 'file-history.md'
  | 'developer-persona.md';

export interface ProjectSnapshot {
  id: string;
  date: Date;
  commit?: string;
  branch?: string;
  recentChanges: string[];
  currentGoal: string;
  knownIssues: string[];
  nextTasks: string[];
  memorySnapshot: Record<MemoryFileName, string>;
}

export interface ArchitecturalDecision {
  id: string;
  date: Date;
  title: string;
  context: string;
  decision: string;
  rationale: string;
  status: 'accepted' | 'rejected' | 'superseded';
  supersededBy?: string;
}

export interface ContextBrief {
  project: string;
  architecture: string;
  recentChanges: string[];
  activeTasks: string[];
  decisions: string[];
  timestamp: Date;
}

export interface EncryptionMetadata {
  algorithm: 'aes-256-gcm';
  iterations: number;
  salt: string;
  iv: string;
  tag: string;
  createdAt: Date;
  version: string;
}

export interface GhostMetadata {
  initialized: Date;
  lastUpdated: Date;
  version: string;
  projectRoot: string;
  totalSnapshots: number;
  totalFileChanges: number;
}

// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export function ok<T>(data: T): Result<T> {
  return { success: true, data };
}

export function err<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const GHOST_DIR = '.ghost';
export const VAULT_FILE = 'ghost.vault';
export const METADATA_DB = 'metadata.db';
export const CONFIG_FILE = 'config.json';
export const SNAPSHOTS_DIR = 'snapshots';

export const MEMORY_FILES: MemoryFileName[] = [
  'project.md',
  'architecture.md',
  'decisions.md',
  'roadmap.md',
  'current-work.md',
  'file-history.md',
  'developer-persona.md',
];

export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '*.lock',
  '.ghost',
  '*.vault',
];

export const DEFAULT_CONFIG: Omit<GhostConfig, 'projectName' | 'projectRoot' | 'ghostDir'> = {
  ignorePatterns: DEFAULT_IGNORE_PATTERNS,
  debounceMs: 1500,
  summarization: 'rule-based',
  encryptionEnabled: false,
  syncEnabled: false,
  apiPort: 7337,
};
