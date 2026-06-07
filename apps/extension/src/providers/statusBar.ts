import * as vscode from 'vscode';

export class GhostStatusBar implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private resetTimer?: NodeJS.Timeout;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.statusBarItem.command = 'ghost.generateAgentBrief';
    this.statusBarItem.show();
    this.setInactive();
  }

  setInactive() {
    this.statusBarItem.text = '$(ghost) Ghost';
    this.statusBarItem.tooltip = 'Ghost Persona — Not initialized. Click to initialize.';
    this.statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
    this.statusBarItem.command = 'ghost.init';
  }

  setActive() {
    this.statusBarItem.text = '$(ghost) Ghost Active';
    this.statusBarItem.tooltip = 'Ghost Persona — Click to generate AI brief';
    this.statusBarItem.color = new vscode.ThemeColor('statusBar.foreground');
    this.statusBarItem.command = 'ghost.generateAgentBrief';
  }

  setWatching() {
    this.statusBarItem.text = '$(eye) Ghost Watching';
    this.statusBarItem.tooltip = 'Ghost Persona — Watching for changes';
  }

  setUpdated(title?: string) {
    this.statusBarItem.text = `$(check) Memory Updated`;
    this.statusBarItem.tooltip = title ? `Ghost: ${title}` : 'Ghost Persona — Memory updated';

    if (this.resetTimer) clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.setWatching(), 4000);
  }

  dispose() {
    this.statusBarItem.dispose();
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }
}
