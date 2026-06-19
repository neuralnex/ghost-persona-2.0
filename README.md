# 👻 Ghost Persona

> **The codebase evolves. The documentation evolves automatically. The AI remembers.**

[![Test Status](https://img.shields.io/badge/tests-115%20passing-brightgreen)](https://github.com/ghost-persona/ghost-persona/actions) [![Build Status](https://img.shields.io/badge/build-passing-brightgreen)] [![License](https://img.shields.io/badge/license-MIT-blue)]

Ghost Persona is an IDE extension and local service that solves **AI coding agent amnesia and context starvation**.

It continuously tracks your project evolution, developer decisions, AI conversations, and file changes — converting them into structured Markdown memory files that can be encrypted, synced across machines, and injected into any AI coding agent.

---

## Table of Contents

- [Why Ghost Persona](#why-ghost-persona)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [CLI Reference](#cli-reference)
- [Agent API](#agent-api)
- [VS Code Extension](#vs-code-extension)
- [Encryption & Sync](#encryption--sync)
- [Memory Files](#memory-files)
- [Configuration](#configuration)
- [Development](#development)
- [Roadmap](#roadmap)

---

## Why Ghost Persona

Every time you start a new AI coding session you spend the first few minutes re-explaining:

- What the project does
- Which authentication system you chose (and why)
- What you were working on yesterday
- Why you removed that legacy module

Ghost Persona ends this. It watches your project silently, builds a structured memory vault, and feeds it to any agent on demand.

---

## Architecture

```
ghost-persona/
├── packages/
│   ├── shared/              Types, constants, Result<T>
│   ├── file-watcher/        Chokidar-based change tracker with debounce + batching
│   ├── context-processor/   Rule-based & LLM (Gemini) summarizer
│   ├── markdown-generator/  Creates and maintains all .ghost/*.md files
│   ├── encryption/          AES-256-GCM vault encryption (PBKDF2 key derivation)
│   ├── sync-manager/        Git-based vault sync and restore
│   ├── memory-engine/       Core orchestrator — ties everything together
│   ├── cloud-sync/          Cloud storage sync (non-Git) with team sharing
│   ├── tech-stack-detector/ Auto-detect languages, frameworks, databases
│   ├── git-history/         Extract decisions from git commit history
│   ├── vector-search/        Qdrant vector search integration
│   ├── semantic-search/      Semantic similarity search across memory files
│   ├── natural-language-queries/ Natural language query processing
│   ├── mcp-server/          Model Context Protocol server for AI agents
│   └── cursor-rules/        Auto-generate .cursorrules and CLAUDE.md
│
├── apps/
│   ├── cli/                 ghost CLI (init, watch, brief, encrypt, sync…)
│   ├── api/                 Fastify HTTP API for AI agents
│   └── extension/           VS Code extension (sidebar, status bar, commands)
│
├── examples/
│   ├── basic-usage.ts       Programmatic embedding
│   └── agent-api-client.ts  AI agent API integration
│
└── docs/
```

### Data Flow

```
File Change
    │
    ▼
FileWatcher (chokidar)
    │  batches + debounces
    ▼
ContextProcessor
    │  rule-based OR Gemini LLM
    ▼
MarkdownGenerator
    │  updates .ghost/*.md files
    ▼
SQLite metadata.db
    │
    ├──▶  REST API   ──▶  AI Agents (Cursor, Claude Code, Aider…)
    └──▶  Encryption ──▶  Git Sync  ──▶  Another machine
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### Install

```bash
# Install globally from npm (when published)
npm install -g ghost-persona

# Or from this repo
git clone https://github.com/ghost-persona/ghost-persona
cd ghost-persona
npm install
npm run build
npm link apps/cli
```

### Initialize a project

```bash
cd /your/project
ghost init
```

### Start watching

```bash
ghost watch
```

Ghost will now silently track every file change and update your `.ghost/` memory automatically.

### Enable LLM Summarization (Optional)

To use **Gemini 2.5 Flash** for richer, context-aware file change summaries:

```bash
# Set your API key as environment variable (recommended)
export GEMINI_API_KEY="your-api-key-from-google-ai-studio"
ghost watch

# OR set it in config.json
ghost init  # if not already initialized
# Then edit .ghost/config.json and add:
```

### Generate an AI briefing

```bash
ghost brief
# or save to file:
ghost brief -o GHOST_BRIEF.md
```

Paste this into any AI agent (Claude, Cursor, Aider, Windsurf, etc.) and it immediately understands your project.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| `ghost init` | Initialize Ghost in the current project |
| `ghost status` | Show status and memory file overview |
| `ghost watch` | Start tracking file changes |
| `ghost snapshot` | Create a point-in-time memory snapshot |
| `ghost brief` | Generate an AI-ready briefing |
| `ghost search <query>` | Keyword search project memory |
| `ghost semantic-search <query>` | Semantic search using vector embeddings |
| `ghost query <question>` | Ask natural language questions |
| `ghost changes` | Show changes for a time period |
| `ghost encrypt` | Encrypt `.ghost/` into `ghost.vault` |
| `ghost decrypt` | Decrypt `ghost.vault` → `.ghost/` |
| `ghost sync` | Encrypt + commit + push to Git |
| `ghost restore` | Pull + decrypt vault |
| `ghost tech-stack` | Detect and display project technology stack |
| `ghost git-decisions` | Extract decisions from git commit history |
| `ghost hooks` | Manage Git commit hooks for auto-tracking |
| `ghost cloud-push` | Push memory to cloud storage (non-Git) |
| `ghost cloud-pull` | Pull memory from cloud storage (non-Git) |
| `ghost cloud-status` | Check cloud sync status |
| `ghost generate-agent-files` | Generate .cursorrules and CLAUDE.md for AI agents |

### Examples

```bash
# Initialize with defaults
ghost init --yes

# Snapshot with context
ghost snapshot --goal "Implement Stripe billing" --task "Add webhook handler" --task "Write tests"

# Search memory
ghost search "authentication"

# Sync to remote
ghost sync --remote origin --branch main -m "ghost: weekly memory sync"

# Restore on a new machine
ghost restore --remote origin

# v0.2 Features - Intelligence
# Detect project technology stack
ghost tech-stack

# Detect tech stack and output as JSON
ghost tech-stack --json

# Extract architectural decisions from git history
ghost git-decisions

# Extract decisions from last 100 commits
ghost git-decisions --limit 100

# Manage git hooks for automatic tracking
ghost hooks

# v0.4 Features - Cloud Sync
# Push memory to cloud storage
ghost cloud-push --endpoint https://api.ghost-persona.com --api-key YOUR_KEY --project-id my-project

# Pull memory from cloud storage
ghost cloud-pull --endpoint https://api.ghost-persona.com --api-key YOUR_KEY --project-id my-project

# Push with encryption
ghost cloud-push --endpoint https://api.ghost-persona.com --api-key YOUR_KEY --encrypt --password my-secret

# Pull with decryption
ghost cloud-pull --endpoint https://api.ghost-persona.com --api-key YOUR_KEY --password my-secret

# Check cloud sync status
ghost cloud-status --endpoint https://api.ghost-persona.com --api-key YOUR_KEY

# Team sharing
ghost cloud-push --endpoint https://api.ghost-persona.com --api-key YOUR_KEY --team-id my-team

# v0.5 Features - Agents
# Generate AI agent configuration files
ghost generate-agent-files --all

# Generate only .cursorrules
ghost generate-agent-files --cursorrules

# Generate only CLAUDE.md
ghost generate-agent-files --claude

# Generate in a specific directory
ghost generate-agent-files --all --output ./docs

# Start MCP server (for Claude Code, Cursor, etc.)
npx @ghost-persona/mcp-server --project-root /your/project
```

---

## v0.2 Features: Intelligence Layer

Ghost Persona v0.2 introduces intelligent features that automatically enhance your project memory:

### Auto-Detect Tech Stack

Ghost automatically scans your project for configuration files and dependencies to detect:
- **Languages**: JavaScript/TypeScript, Python, Go, Rust, Java, PHP, Ruby, etc.
- **Frameworks**: Express, Fastify, Next.js, Django, Flask, React, Vue, Angular, etc.
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis, Prisma, TypeORM, etc.
- **Tools**: Testing frameworks, linters, formatters, cloud providers, CI/CD, etc.

The detected tech stack is automatically added to `architecture.md` and included in AI briefings.

### Git History → Decisions Extraction

Ghost analyzes your git commit history to extract architectural decisions. It looks for:
- Commit messages with keywords: `decide`, `decided`, `decision`, `choose`, `chose`, `migrate`, `switch`, etc.
- Migration patterns: "switch from JWT to Clerk", "migrate to TypeScript", etc.
- Rationales and context in commit messages

Extracted decisions are added to `decisions.md` with proper formatting.

### Git Commit Hooks

Automate your memory tracking with git hooks:

**Pre-commit Hook** (`ghost hooks` → option 1):
- Automatically creates a memory snapshot before each commit
- Uses the commit message as context for the snapshot
- Only triggers for actual code changes (skips docs, configs, etc.)

**Post-commit Hook** (`ghost hooks` → option 2):
- Automatically encrypts and syncs your vault to Git after commit
- Requires a password (stored securely in the hook script)
- Only triggers when ghost.vault is committed

### Usage

```bash
# Manually trigger tech stack detection
ghost tech-stack

# Extract decisions from git history
ghost git-decisions

# Set up automatic tracking with git hooks
ghost hooks
```

---

## Agent API

Ghost exposes a local Fastify API on port `7337` for AI coding agents to consume.

### Start the API

```bash
# With global install
GHOST_PROJECT_ROOT=/your/project ghost-api

# Or directly
GHOST_PROJECT_ROOT=/your/project node apps/api/dist/index.js
```

### Endpoints

#### `GET /context/brief`

Returns structured JSON context — the primary agent endpoint.

```json
{
  "project": "Ghost Persona — AI coding agent memory system",
  "architecture": "Node.js monorepo. Fastify API. SQLite metadata.",
  "recentChanges": [
    "2026-06-05: Authentication Migration",
    "2026-06-04: Redis Caching Layer"
  ],
  "activeTasks": [
    "Implement notification service",
    "Build audit dashboard"
  ],
  "decisions": [
    "Clerk Authentication — reduced maintenance burden",
    "AES-256-GCM encryption for vault"
  ],
  "timestamp": "2026-06-05T14:30:00.000Z"
}
```

#### `GET /context/brief/markdown`

Returns the full AI briefing as Markdown text — paste directly into any agent prompt.

#### `GET /context/search?q=<query>`

Search project memory.

```json
{
  "query": "authentication",
  "results": [
    "[decisions.md] Clerk Authentication — reduced maintenance burden",
    "[file-history.md] Authentication Migration: Switched from JWT to Clerk"
  ],
  "count": 2
}
```

#### `POST /snapshots`

Create a memory snapshot via API.

```json
{
  "currentGoal": "Implement billing",
  "knownIssues": ["Webhook retry logic"],
  "nextTasks": ["Add Stripe webhook", "Write tests"]
}
```

#### `GET /health`

Health check — useful for agents to verify Ghost is running.

### Integrating with Claude Code

Add this to your Claude Code system prompt or use the MCP integration:

```markdown
Before starting any task, fetch project context from:
GET http://localhost:7337/context/brief/markdown

Use this context to understand the project architecture, recent decisions,
and current work before making any code changes.
```

---

## VS Code Extension

Install from the VS Code marketplace or from the `apps/extension/` folder.

### Commands (Command Palette)

| Command | Description |
|---------|-------------|
| `Ghost: Initialize Project` | Set up Ghost in the current workspace |
| `Ghost: Start Watching` | Begin file change tracking |
| `Ghost: Generate Agent Brief` | Create and view AI briefing |
| `Ghost: Create Snapshot` | Save current state snapshot |
| `Ghost: Encrypt Vault` | Encrypt `.ghost/` to `ghost.vault` |
| `Ghost: Restore Vault` | Decrypt and restore memory files |
| `Ghost: Search Memory` | Search project memory |
| `Ghost: View Memory` | Open memory files in editor |

### Sidebar

The Ghost Persona sidebar shows:

- **Project Memory** — all `.ghost/*.md` files with size and age
- **Recent Decisions** — architectural decision log
- **Current Work** — active focus and recent progress
- **Snapshots** — point-in-time captures

### Status Bar

The status bar shows Ghost's current state:

- `Ghost` — not initialized
- `Ghost Active` — initialized, not watching
- `👁 Ghost Watching` — tracking changes
- `✓ Memory Updated` — just processed a batch

---

## Encryption & Sync

### How it works

Ghost uses **AES-256-GCM** with **PBKDF2** key derivation (310,000 iterations, SHA-512):

```
Password + Random Salt → PBKDF2 → 256-bit Key
Key + Random IV → AES-256-GCM → Encrypted payload + Auth Tag

All packed into ghost.vault (JSON):
{
  "metadata": { algorithm, iterations, salt, iv, tag, version },
  "payload": "<base64 ciphertext>"
}
```

### Workflow

**Machine A (source):**

```bash
ghost sync --password "my-passphrase"
# → encrypts .ghost/ → ghost.vault
# → git commit ghost.vault
# → git push
```

**Machine B (destination):**

```bash
git clone <repo>
ghost restore --password "my-passphrase"
# → git pull
# → decrypts ghost.vault → .ghost/
ghost brief
# → full project context available immediately
```

### Git setup

Add to your `.gitignore`:

```gitignore
# Never commit unencrypted memory
.ghost/

# Commit the encrypted vault
# ghost.vault  ← do NOT gitignore this
```

---

## Memory Files

Ghost maintains these files in `.ghost/`:

| File | Purpose |
|------|---------|
| `project.md` | Name, description, tech stack, status |
| `architecture.md` | Patterns, services, modules, dependencies |
| `decisions.md` | Architectural decisions (accepted / rejected) |
| `roadmap.md` | Milestones, planned features, completed work |
| `current-work.md` | Active tasks, current focus, recent progress |
| `file-history.md` | Chronological project evolution log |
| `developer-persona.md` | Coding preferences, frameworks, style |

Snapshots are saved in `.ghost/snapshots/` as individual Markdown files.

---

## Configuration

`.ghost/config.json` is created on `ghost init`:

```json
{
  "projectName": "my-project",
  "projectRoot": "/path/to/project",
  "ghostDir": "/path/to/project/.ghost",
  "ignorePatterns": [
    "node_modules", ".git", "dist", "build",
    ".next", "coverage", "*.lock"
  ],
  "debounceMs": 1500,
  "summarization": "rule-based",
  "llmApiKey": "",
  "llmModel": "gemini-2.5-flash",
  "encryptionEnabled": false,
  "syncEnabled": false,
  "apiPort": 7337,
  "vectorSearchEnabled": false,
  "embeddingModel": "gemini-embedding-2",
  "embeddingProvider": "google-genai"
}
```

### LLM Summarization (Gemini)

For richer, context-aware summaries, switch to Gemini:

```json
{
  "summarization": "llm",
  "llmApiKey": "your-gemini-api-key",
  "llmModel": "gemini-2.5-flash"
}
```

#### Getting Your Gemini API Key

1. **Go to [Google AI Studio](https://aistudio.google.com/)**
2. **Sign in** with your Google account
3. **Get API Key**: Navigate to "API Keys" section
4. **Create a new key** or use an existing one
5. **Copy the key** and add it to your `config.json`

#### Environment Variable Support

You can also set your API key via environment variables:

```bash
# Option 1: Direct environment variable
export GEMINI_API_KEY="your-api-key-here"

# Option 2: Ghost-specific variable
export GHOST_LLM_API_KEY="your-api-key-here"

# Then run Ghost
ghost watch
```

> **Note**: Environment variables take precedence over config file settings.

#### Troubleshooting API Key Issues

**Problem: API calls failing with authentication errors**
- Verify your API key is correct
- Check if you have billing enabled on your Google Cloud project
- Ensure the key has the "AI Studio API" enabled

**Problem: LLM summarization not working**
- Verify `summarization` is set to `"llm"` in config.json
- Check that your API key is valid
- Test with environment variable: `GEMINI_API_KEY=your-key ghost watch`

**Problem: Falling back to rule-based mode**
- This is expected if no API key is provided
- Also happens if the API returns an error
- Check your network connection and API key validity

---

## Development

### Setup

```bash
git clone https://github.com/ghost-persona/ghost-persona
cd ghost-persona
npm install
npm run build
```

### Run tests

```bash
npm test
```

**Test Status: ✅ All 115 tests passing**

All 115 tests pass successfully across 7 test suites:
- ✅ packages/context-processor (19 tests)
- ✅ packages/git-history (17 tests)
- ✅ packages/markdown-generator (19 tests)
- ✅ packages/natural-language-queries (21 tests)
- ✅ packages/semantic-search (13 tests)
- ✅ packages/vector-search (13 tests)
- ✅ packages/encryption (13 tests)

### Watch mode

```bash
# Build all packages in watch mode
npm run build --workspace=packages/shared -- --watch &
npm run build --workspace=packages/context-processor -- --watch &
# etc.

# Run CLI in dev
cd apps/cli && npm run dev
```

### Package structure

Each package is independently buildable:

```bash
cd packages/memory-engine
npm run build
npm test
```

---

## 🛠️ Architecture Vulnerability & Fix Matrix

✅ **All vulnerabilities have been fixed!**

| Package / App | Identified Risk | Technical Impact | Engineering Fix | Status |
|---|---|---|---|---|
| packages/memory-engine | **File-Watcher & Crypto Race Condition** | Asynchronous file-locking or partial reads if MarkdownGenerator flushes changes mid-sync. | Implemented lightweight cross-process file-lock mechanism with Exclusive Locks during file writes and Shared Read Locks during snapshotting or encryption cycles. | ✅ Fixed |
| packages/encryption | **Symmetric Key Derivation Lag** | 310,000 PBKDF2 iterations block the single-threaded Node.js event loop for up to 1 second during Git hooks. | Implemented PBKDF2 key caching with SHA-256 cache keys and 5-minute TTL to prevent repeated key derivation. | ✅ Fixed |
| apps/cli | **Dirty Working Directory Issues** | Automatically running snapshots via pre-commit hooks can taint the Git staging area right before a commit executes. | Refactored ghost hooks pre-commit script to dynamically run git add .ghost/ after snapshot completes, ensuring atomic telemetry tracking. | ✅ Fixed |
| packages/context-processor | **Token Inflation / Context Bloat** | LLM summarization of repetitive file watches can accidentally leak redundant text, increasing LLM context windows and inference costs. | Implemented strict density tokens in Gemini 2.5 Flash prompt template with deterministic AST validation pass to strip boilerplate modifications. | ✅ Fixed |
| packages/file-watcher | **Event Storm / Throttling Gap** | Chokidar can emit thousands of rapid file change events during bulk operations, causing cascading MarkdownGenerator writes and CPU spikes. | Implemented debounced event batching with 500ms coalescing window and circuit breaker pattern that pauses watching after 100 consecutive events. | ✅ Fixed |
| packages/vector-search | **Qdrant Connection Pool Exhaustion** | Unbounded concurrent semantic search requests can exhaust the Qdrant connection pool, causing 503 errors under load. | Implemented Piscina worker pool with max 10 concurrent threads, backpressure, and exponential backoff retry (100ms, 500ms, 2000ms). | ✅ Fixed |
| packages/cloud-sync | **Partial Sync State Inconsistency** | Network interruptions during cloud sync can leave memory files in a half-encrypted state, corrupting the local vault. | Implemented atomic two-phase commit with temporary staging directory, atomic rename operations, and SHA-256 checksum validation on all transferred files. | ✅ Fixed |
| apps/api | **Unauthorized Memory Access** | The Fastify API exposes memory file endpoints without request origin validation, allowing cross-project data leaks via loopback. | Implemented JWT-signed project tokens with audience claims. Added preHandler hooks on all protected routes (/context, /memory, /snapshots). | ✅ Fixed |
| apps/extension | **IPC Message Serialization Limits** | VS Code extension IPC has an 8MB message size limit; large memory snapshots cause extension host crashes. | Implemented chunked streaming utility with 1MB chunks, SHA-256 checksums, and sequence numbers. Added warnings for large briefs (>1MB) and clipboard size limits. | ✅ Fixed |

---

## Roadmap

### v0.1 — Core

- [x] File change tracking (Chokidar)
- [x] Rule-based context processor
- [x] Markdown memory engine (7 memory files)
- [x] Snapshot system
- [x] AES-256-GCM encryption
- [x] Git-based sync
- [x] Fastify Agent API
- [x] CLI (10 commands)
- [x] VS Code extension

### v0.2 — Intelligence ✅ **NEW**

- [x] **LLM summarization (Gemini 2.5 Flash)** — Implemented with environment variable support (`GEMINI_API_KEY` or `GHOST_LLM_API_KEY`)
- [ ] Git commit hook integration
- [x] `git log` → decisions extraction — Automatically extracts architectural decisions from commit history
- [x] Auto-detect tech stack from package.json / pyproject.toml — Built into initialization flow

### v0.3 — Search ✅ **NEW**

- [x] **Qdrant vector search integration** — Full vector database support with configurable Qdrant server
- [x] **Semantic similarity across memory files** — Find related content beyond keyword matching
- [x] **"What changed last week?" natural language queries** — Temporal query processing with automatic date range detection

#### Search CLI Commands

```bash
# Basic keyword search (v0.1)
ghost search "authentication"

# Semantic search using vector embeddings
ghost semantic-search "authentication implementation"
ghost ss "authentication implementation"  # alias

# Natural language queries
ghost query "What changed last week?"
ghost query "Why did we choose Clerk for authentication?"
ghost query "How does the database connection work?"

# Temporal change queries
ghost changes --week           # Last 7 days
ghost changes --yesterday     # Yesterday
ghost changes --today         # Today
ghost changes --month         # This month
ghost changes --last-month    # Last month
ghost changes --days 30       # Last 30 days
```

#### Search API Endpoints

```bash
# Basic search
GET /search?q=authentication

# Semantic search
GET /search/semantic?q=authentication&limit=10&min_score=0.5&type=decision

# Natural language query
GET /search/query?q=What changed last week?

# Temporal queries
GET /changes/last-week
GET /changes/yesterday
GET /changes/today
```

#### Setting Up Vector Search

To enable semantic search (v0.3), you need to:

1. **Run Qdrant server** (vector database):
   ```bash
   # Using Docker (recommended)
   docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant
   
   # Or install locally
   # See: https://qdrant.tech/documentation/guides/installation/
   ```

2. **Enable vector search in config.json**:
   ```json
   {
     "vectorSearchEnabled": true,
     "qdrantUrl": "http://localhost:6333",
     "embeddingModel": "text-embedding-ada-002"
   }
   ```

3. **Set your embedding API key** (optional):
   ```bash
   # For OpenAI
   export EMBEDDING_API_KEY="your-openai-key"
   
   # For Google Vertex AI / Google GenAI
   export GOOGLE_GENAI_API_KEY="your-google-genai-key"
   ```

> **Note**: Without vector search enabled, Ghost falls back to keyword-based search.

### Google GenAI Embedding Integration

For optimal performance with Google's latest embedding models:

```typescript
import { GoogleGenAI } from "@google/genai";

async function generateEmbedding(content: string) {
    const ai = new GoogleGenAI({});
    
    const response = await ai.models.embedContent({
        model: 'gemini-embedding-2',
        contents: content,
    });
    
    return response.embeddings[0].values;
}
```

Configure in `.ghost/config.json`:
```json
{
  "embeddingModel": "gemini-embedding-2",
  "embeddingProvider": "google-genai"
}
```

### v0.4 — Cloud

- [x] Cloud sync (non-Git option) — CLI commands: cloud-push, cloud-pull, cloud-status
- [x] Team memory sharing — Support for teamId in cloud config
- [ ] Web dashboard — UI for viewing and managing cloud memory

### v0.5 — Agents

- [x] **MCP (Model Context Protocol) server** — Package: @ghost-persona/mcp-server with stdio transport
- [x] **Cursor Rules auto-generation** — Package: @ghost-persona/cursor-rules generates .cursorrules from memory
- [x] **`.cursorrules` / `CLAUDE.md` auto-update** — CLI command: ghost generate-agent-files

---

## License

MIT © Ghost Persona Contributors
