# 👻 Ghost Persona

> **The codebase evolves. The documentation evolves automatically. The AI remembers.**

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
│   └── memory-engine/       Core orchestrator — ties everything together
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
| `ghost search <query>` | Search project memory |
| `ghost encrypt` | Encrypt `.ghost/` into `ghost.vault` |
| `ghost decrypt` | Decrypt `ghost.vault` → `.ghost/` |
| `ghost sync` | Encrypt + commit + push to Git |
| `ghost restore` | Pull + decrypt vault |

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
  "llmModel": "gemini-1.5-flash",
  "encryptionEnabled": false,
  "syncEnabled": false,
  "apiPort": 7337
}
```

### LLM Summarization (Gemini)

For richer, context-aware summaries, switch to Gemini:

```json
{
  "summarization": "llm",
  "llmApiKey": "your-gemini-api-key",
  "llmModel": "gemini-1.5-flash"
}
```

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

## Roadmap

### v0.1 — Core (this release)

- [x] File change tracking (Chokidar)
- [x] Rule-based context processor
- [x] Markdown memory engine (7 memory files)
- [x] Snapshot system
- [x] AES-256-GCM encryption
- [x] Git-based sync
- [x] Fastify Agent API
- [x] CLI (10 commands)
- [x] VS Code extension

### v0.2 — Intelligence

- [ ] LLM summarization (Gemini) — fully tested
- [ ] Git commit hook integration
- [ ] `git log` → decisions extraction
- [ ] Auto-detect tech stack from package.json / pyproject.toml

### v0.3 — Search

- [ ] Qdrant vector search integration
- [ ] Semantic similarity across memory files
- [ ] "What changed last week?" natural language queries

### v0.4 — Cloud

- [ ] Cloud sync (non-Git option)
- [ ] Team memory sharing
- [ ] Web dashboard

### v0.5 — Agents

- [ ] MCP (Model Context Protocol) server
- [ ] Cursor Rules auto-generation
- [ ] `.cursorrules` / `CLAUDE.md` auto-update

---

## License

MIT © Ghost Persona Contributors
