/**
 * Ghost Persona — Programmatic Usage Example
 *
 * This example shows how to embed Ghost Persona directly
 * into a Node.js application or custom tooling.
 */

import { MemoryEngine } from '@ghost-persona/memory-engine';
import { GhostConfig, DEFAULT_CONFIG } from '@ghost-persona/shared';
import path from 'path';

const projectRoot = process.cwd();

const config: GhostConfig = {
  ...DEFAULT_CONFIG,
  projectName: 'My Awesome App',
  projectRoot,
  ghostDir: path.join(projectRoot, '.ghost'),
  summarization: 'rule-based',   // or 'llm' with llmApiKey
  debounceMs: 2000,
};

async function main() {
  // 1. Create the engine
  const engine = new MemoryEngine(config);

  // 2. Initialize (creates .ghost/ directory and memory files)
  const initResult = await engine.initialize();
  if (!initResult.success) {
    console.error('Init failed:', initResult.error.message);
    process.exit(1);
  }

  console.log('✓ Ghost initialized');

  // 3. Start watching for file changes
  engine.on('batch-processed', (context) => {
    console.log(`[Ghost] ${context.title}`);
    console.log(`        ${context.summary}`);
  });

  const startResult = await engine.start();
  if (!startResult.success) {
    console.error('Watch failed:', startResult.error.message);
    process.exit(1);
  }

  console.log('✓ Watching for changes...');

  // 4. Create a snapshot manually
  const snapshotResult = await engine.createSnapshot({
    currentGoal: 'Implement user authentication',
    knownIssues: ['Session refresh edge case'],
    nextTasks: ['Add MFA support', 'Write integration tests'],
  });

  if (snapshotResult.success) {
    console.log(`✓ Snapshot created: ${snapshotResult.data.id}`);
  }

  // 5. Search project memory
  const results = await engine.search('authentication');
  console.log('\nSearch results for "authentication":');
  results.forEach((r) => console.log(' ·', r));

  // 6. Generate an AI briefing
  const brief = await engine.generateBrief();
  console.log('\n--- AI Briefing ---\n');
  console.log(brief.slice(0, 500) + '...\n');

  // 7. Get structured context for the Agent API
  const contextBrief = await engine.getContextBrief();
  console.log('Structured context:', JSON.stringify(contextBrief, null, 2));

  // 8. Stop gracefully
  await engine.stop();
  console.log('✓ Ghost stopped');
}

main().catch(console.error);
