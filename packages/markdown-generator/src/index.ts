import fs from 'fs/promises';
import path from 'path';
import {
  GhostConfig,
  MemoryFileName,
  MEMORY_FILES,
  GHOST_DIR,
  ProjectSnapshot,
  SNAPSHOTS_DIR,
  ContextBrief,
} from '@ghost-persona/shared';
import { ProcessedContext } from '@ghost-persona/context-processor';

// ─── Template Generators ──────────────────────────────────────────────────────

function templateProject(config: GhostConfig): string {
  return `# Project: ${config.projectName}

> Ghost Persona memory file — auto-generated and maintained

## Overview

| Field | Value |
|-------|-------|
| Name | ${config.projectName} |
| Root | \`${config.projectRoot}\` |
| Initialized | ${new Date().toISOString().split('T')[0]} |
| Status | Active |

## Description

_Add a description of this project here._

## Tech Stack

_Detected automatically as you work._

## Current Status

Active development.

---
_Last updated: ${new Date().toISOString()}_
`;
}

function templateArchitecture(config: GhostConfig): string {
  return `# Architecture: ${config.projectName}

> Ghost Persona memory file — auto-generated and maintained

## Overview

_Architecture patterns will be detected and recorded as development progresses._

## Services & Modules

_Modules will appear here as they are created._

## Key Dependencies

_Dependencies will be tracked automatically._

## Data Flow

_Document your system's data flow here._

---
_Last updated: ${new Date().toISOString()}_
`;
}

function templateDecisions(): string {
  return `# Architectural Decisions

> Ghost Persona memory file — auto-generated and maintained

## Decision Log

_Decisions are recorded automatically when Ghost detects migrations, refactors, or significant changes._

---
_Last updated: ${new Date().toISOString()}_
`;
}

function templateRoadmap(): string {
  return `# Roadmap

> Ghost Persona memory file — auto-generated and maintained

## Current Milestone

_Define your current milestone here._

## Planned Features

_Add planned features as your project evolves._

## Completed

_Completed items will be tracked here._

---
_Last updated: ${new Date().toISOString()}_
`;
}

function templateCurrentWork(): string {
  return `# Current Work

> Ghost Persona memory file — auto-generated and maintained

## Active Focus

_Ghost will track your recent file activity to infer current focus._

## Recent Progress

_Recent changes will appear here._

## Open Tasks

_Add your current tasks here._

---
_Last updated: ${new Date().toISOString()}_
`;
}

function templateFileHistory(): string {
  return `# File History

> Ghost Persona memory file — auto-generated and maintained

## Changelog

_File changes are recorded automatically as you develop._

---
_Last updated: ${new Date().toISOString()}_
`;
}

function templateDeveloperPersona(): string {
  return `# Developer Persona

> Ghost Persona memory file — auto-generated and maintained

## Coding Preferences

_Ghost infers preferences from your file patterns._

## Preferred Frameworks

_Detected as you work._

## Architecture Style

_Inferred from project structure._

## Notes

_Add personal preferences here to help AI agents understand your style._

---
_Last updated: ${new Date().toISOString()}_
`;
}

const TEMPLATE_MAP: Record<MemoryFileName, (config: GhostConfig) => string> = {
  'project.md': templateProject,
  'architecture.md': templateArchitecture,
  'decisions.md': () => templateDecisions(),
  'roadmap.md': () => templateRoadmap(),
  'current-work.md': () => templateCurrentWork(),
  'file-history.md': () => templateFileHistory(),
  'developer-persona.md': () => templateDeveloperPersona(),
};

// ─── Markdown Generator ───────────────────────────────────────────────────────

export class MarkdownGenerator {
  private readonly ghostDir: string;
  private readonly config: GhostConfig;

  constructor(config: GhostConfig) {
    this.config = config;
    this.ghostDir = path.join(config.projectRoot, GHOST_DIR);
  }

  async initialize(): Promise<void> {
    // Create .ghost directory
    await fs.mkdir(this.ghostDir, { recursive: true });
    await fs.mkdir(path.join(this.ghostDir, SNAPSHOTS_DIR), { recursive: true });

    // Generate initial memory files (skip if they already exist)
    for (const fileName of MEMORY_FILES) {
      const filePath = path.join(this.ghostDir, fileName);
      try {
        await fs.access(filePath);
        // File exists — skip
      } catch {
        const content = TEMPLATE_MAP[fileName](this.config);
        await fs.writeFile(filePath, content, 'utf-8');
      }
    }

    // Write config
    const configPath = path.join(this.ghostDir, 'config.json');
    try {
      await fs.access(configPath);
    } catch {
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2), 'utf-8');
    }
  }

  async appendFileHistory(context: ProcessedContext): Promise<void> {
    const filePath = path.join(this.ghostDir, 'file-history.md');
    const entry = this.formatHistoryEntry(context);

    let content = await this.readFile('file-history.md');

    // Insert new entry after the ## Changelog header
    const insertAfter = '## Changelog';
    const idx = content.indexOf(insertAfter);
    if (idx !== -1) {
      const insertAt = idx + insertAfter.length;
      content = content.slice(0, insertAt) + '\n\n' + entry + content.slice(insertAt);
    } else {
      content += '\n\n' + entry;
    }

    content = this.updateTimestamp(content);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async appendDecision(context: ProcessedContext): Promise<void> {
    if (context.changeType !== 'migration' && context.changeType !== 'refactoring') return;

    const filePath = path.join(this.ghostDir, 'decisions.md');
    const entry = this.formatDecisionEntry(context);

    let content = await this.readFile('decisions.md');
    const insertAfter = '## Decision Log';
    const idx = content.indexOf(insertAfter);
    if (idx !== -1) {
      const insertAt = idx + insertAfter.length;
      content = content.slice(0, insertAt) + '\n\n' + entry + content.slice(insertAt);
    } else {
      content += '\n\n' + entry;
    }

    content = this.updateTimestamp(content);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async updateCurrentWork(context: ProcessedContext): Promise<void> {
    const filePath = path.join(this.ghostDir, 'current-work.md');
    let content = await this.readFile('current-work.md');

    const focusSection = `## Active Focus\n\n**${context.title}**\n\n${context.summary}\n\nAreas: ${context.affectedAreas.join(', ')}`;
    const progressEntry = `- ${context.timestamp.toISOString().split('T')[0]}: ${context.title}`;

    // Replace Active Focus section
    content = content.replace(
      /## Active Focus[\s\S]*?(?=##|---)/,
      focusSection + '\n\n'
    );

    // Append to Recent Progress
    const progressHeader = '## Recent Progress';
    const idx = content.indexOf(progressHeader);
    if (idx !== -1) {
      const insertAt = idx + progressHeader.length;
      const nextSection = content.indexOf('\n##', insertAt);
      if (nextSection !== -1) {
        content =
          content.slice(0, insertAt) +
          '\n\n' +
          progressEntry +
          '\n' +
          content.slice(insertAt);
      }
    }

    content = this.updateTimestamp(content);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async updateArchitecture(context: ProcessedContext): Promise<void> {
    if (!['feature-addition', 'migration', 'refactoring'].includes(context.changeType)) return;

    const filePath = path.join(this.ghostDir, 'architecture.md');
    let content = await this.readFile('architecture.md');

    for (const area of context.affectedAreas) {
      if (!content.includes(area)) {
        const modulesSection = '## Services & Modules';
        const idx = content.indexOf(modulesSection);
        if (idx !== -1) {
          const insertAt = idx + modulesSection.length;
          content =
            content.slice(0, insertAt) +
            `\n\n### ${area}\n\n${context.summary}` +
            content.slice(insertAt);
        }
      }
    }

    content = this.updateTimestamp(content);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async createSnapshot(snapshot: ProjectSnapshot): Promise<void> {
    const snapshotDir = path.join(this.ghostDir, SNAPSHOTS_DIR);
    const fileName = `${snapshot.date.toISOString().replace(/[:.]/g, '-')}_${snapshot.id.slice(0, 8)}.md`;
    const filePath = path.join(snapshotDir, fileName);

    const content = `# Snapshot

Date: ${snapshot.date.toISOString()}

Commit: ${snapshot.commit ?? 'manual'}

Branch: ${snapshot.branch ?? 'unknown'}

## Recent Changes

${snapshot.recentChanges.map((c) => `- ${c}`).join('\n') || '_No recent changes._'}

## Current Goal

${snapshot.currentGoal || '_Not specified._'}

## Known Issues

${snapshot.knownIssues.map((i) => `- ${i}`).join('\n') || '_None recorded._'}

## Next Tasks

${snapshot.nextTasks.map((t) => `- ${t}`).join('\n') || '_Not specified._'}

---
_Snapshot ID: ${snapshot.id}_
`;

    await fs.writeFile(filePath, content, 'utf-8');
  }

  async generateBrief(): Promise<string> {
    const [project, architecture, decisions, currentWork] = await Promise.all([
      this.readFile('project.md').catch(() => ''),
      this.readFile('architecture.md').catch(() => ''),
      this.readFile('decisions.md').catch(() => ''),
      this.readFile('current-work.md').catch(() => ''),
    ]);

    return `# Ghost Persona Brief

> Auto-generated AI context briefing

## Project

${this.extractSection(project, 'Overview') || this.config.projectName}

## Architecture

${this.extractSection(architecture, 'Overview') || '_Architecture details in architecture.md_'}

## Current Work

${this.extractSection(currentWork, 'Active Focus') || '_See current-work.md_'}

## Recent Decisions

${this.extractSection(decisions, 'Decision Log') || '_No decisions recorded yet._'}

---
_Generated: ${new Date().toISOString()}_
_Token estimate: ~${Math.round((project + architecture + decisions + currentWork).length / 4)} tokens_
`;
  }

  async generateContextBrief(): Promise<ContextBrief> {
    const [project, architecture, decisions, currentWork, fileHistory] = await Promise.all([
      this.readFile('project.md').catch(() => ''),
      this.readFile('architecture.md').catch(() => ''),
      this.readFile('decisions.md').catch(() => ''),
      this.readFile('current-work.md').catch(() => ''),
      this.readFile('file-history.md').catch(() => ''),
    ]);

    return {
      project: this.extractFirstParagraph(project),
      architecture: this.extractFirstParagraph(architecture),
      recentChanges: this.extractListItems(fileHistory, 5),
      activeTasks: this.extractListItems(currentWork, 10),
      decisions: this.extractListItems(decisions, 10),
      timestamp: new Date(),
    };
  }

  async readFile(name: MemoryFileName | string): Promise<string> {
    const filePath = path.join(this.ghostDir, name);
    return fs.readFile(filePath, 'utf-8');
  }

  async readAllMemory(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    for (const name of MEMORY_FILES) {
      try {
        result[name] = await this.readFile(name);
      } catch {
        result[name] = '';
      }
    }
    return result;
  }

  // ─── Formatting Helpers ────────────────────────────────────────────────────

  private formatHistoryEntry(context: ProcessedContext): string {
    return `## ${context.title}

Date: ${context.timestamp.toISOString().split('T')[0]}

${context.summary}

${context.details.map((d) => `- ${d}`).join('\n')}

Areas: ${context.affectedAreas.join(', ')}

---`;
  }

  private formatDecisionEntry(context: ProcessedContext): string {
    return `### ${context.title}

**Date:** ${context.timestamp.toISOString().split('T')[0]}

**Status:** Accepted

**Context:**
${context.summary}

**Decision:**
${context.details.join('\n')}

---`;
  }

  private updateTimestamp(content: string): string {
    return content.replace(
      /_Last updated: .+_/,
      `_Last updated: ${new Date().toISOString()}_`
    );
  }

  private extractSection(content: string, heading: string): string {
    const regex = new RegExp(`## ${heading}([\\s\\S]*?)(?=\\n##|---\\s*$|$)`);
    const match = content.match(regex);
    return match ? match[1].trim() : '';
  }

  private extractFirstParagraph(content: string): string {
    const lines = content.split('\n');
    const paragraphs = lines
      .filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('_') && !l.startsWith('>'))
      .slice(0, 3);
    return paragraphs.join(' ').trim() || content.slice(0, 200);
  }

  private extractListItems(content: string, max: number): string[] {
    const matches = content.match(/^[-*]\s+(.+)$/gm) ?? [];
    return matches
      .slice(0, max)
      .map((m) => m.replace(/^[-*]\s+/, '').trim());
  }
}
