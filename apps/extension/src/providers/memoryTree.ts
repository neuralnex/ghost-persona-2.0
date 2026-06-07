import * as vscode from 'vscode';
import path from 'path';
import fs from 'fs';
import { GHOST_DIR, MEMORY_FILES } from '@ghost-persona/shared';

export class MemoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filePath?: string,
    public readonly description?: string
  ) {
    super(label, collapsibleState);

    if (filePath) {
      this.command = {
        command: 'vscode.open',
        title: 'Open Memory File',
        arguments: [vscode.Uri.file(filePath)],
      };
      this.resourceUri = vscode.Uri.file(filePath);
      this.contextValue = 'memoryFile';
    }

    if (description) {
      this.description = description;
    }

    this.iconPath = new vscode.ThemeIcon('file-text');
  }
}

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly ghostDir: string;

  constructor(private readonly workspaceRoot: string) {
    this.ghostDir = path.join(workspaceRoot, GHOST_DIR);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MemoryTreeItem): MemoryTreeItem[] {
    if (!element) {
      return this.getMemoryFiles();
    }
    return [];
  }

  private getMemoryFiles(): MemoryTreeItem[] {
    if (!fs.existsSync(this.ghostDir)) {
      return [
        new MemoryTreeItem(
          'Not initialized',
          vscode.TreeItemCollapsibleState.None,
          undefined,
          'Run Ghost: Initialize Project'
        ),
      ];
    }

    return MEMORY_FILES.map((fileName) => {
      const filePath = path.join(this.ghostDir, fileName);
      let description = '';

      try {
        const stat = fs.statSync(filePath);
        const kb = (stat.size / 1024).toFixed(1);
        const age = this.formatAge(stat.mtime);
        description = `${kb}kb · ${age}`;
      } catch {
        description = 'missing';
      }

      return new MemoryTreeItem(
        fileName,
        vscode.TreeItemCollapsibleState.None,
        filePath,
        description
      );
    });
  }

  private formatAge(date: Date): string {
    const diff = Date.now() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
}
