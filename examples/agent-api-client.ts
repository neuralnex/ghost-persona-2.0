/**
 * Ghost Persona — Agent API Integration Example
 *
 * Shows how AI coding agents (Cursor, Claude Code, Aider, etc.)
 * can consume the Ghost Persona API to get full project context
 * before starting a coding session.
 */

const GHOST_API = 'http://localhost:7337';

interface ProjectContext {
  project: string;
  architecture: string;
  recentChanges: string[];
  activeTasks: string[];
  decisions: string[];
}

interface SearchResponse {
  results: string[];
}

interface HealthResponse {
  status: 'ok' | 'error';
}

async function getProjectContext() {
  // Fetch structured JSON brief
  const res = await fetch(`${GHOST_API}/context/brief`);
  const context = await res.json() as ProjectContext;

  console.log('Project:', context.project);
  console.log('Architecture:', context.architecture);
  console.log('Recent changes:', context.recentChanges);
  console.log('Active tasks:', context.activeTasks);
  console.log('Decisions:', context.decisions);

  return context;
}

async function getMarkdownBrief() {
  // Fetch ready-to-paste markdown for AI prompts
  const res = await fetch(`${GHOST_API}/context/brief/markdown`);
  const markdown = await res.text();
  return markdown;
}

async function searchMemory(query: string) {
  const res = await fetch(`${GHOST_API}/context/search?q=${encodeURIComponent(query)}`);
  const data = await res.json() as SearchResponse;
  return data.results;
}

export async function createSnapshot(goal: string) {
  const res = await fetch(`${GHOST_API}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      currentGoal: goal,
      nextTasks: ['Review PR', 'Update docs'],
    }),
  });
  return res.json();
}

// ─── Example: Injecting context into a Claude Code session ───────────────────

async function buildAgentPrompt(userRequest: string): Promise<string> {
  const brief = await getMarkdownBrief();

  return `${brief}

---

## Current Request

${userRequest}

Please help me with this request, taking into account the full project context above.
`;
}

// ─── Example: Custom agent pre-flight check ───────────────────────────────────

async function agentPreFlight() {
  // 1. Check Ghost is running
  const health = await fetch(`${GHOST_API}/health`)
    .then((r) => r.json() as Promise<HealthResponse>)
    .catch(() => null);
  if (!health || health.status !== 'ok') {
    console.warn('Ghost Persona API not available — agent will run without context');
    return null;
  }

  // 2. Search for relevant context
  const authContext = await searchMemory('authentication');
  const dbContext = await searchMemory('database');

  // 3. Build a targeted context injection
  return {
    health,
    relevantContext: {
      authentication: authContext,
      database: dbContext,
    },
  };
}

async function main() {
  console.log('Fetching project context from Ghost Persona API...\n');

  try {
    const context = await getProjectContext();
    const prompt = await buildAgentPrompt('Add password reset functionality');
    const prefly = await agentPreFlight();

    console.log('Loaded project context for:', context.project);
    console.log('Pre-flight status:', prefly ? 'ready' : 'unavailable');
    console.log('\n--- Sample Agent Prompt Prefix ---\n');
    console.log(prompt.slice(0, 800));
    console.log('\n...(truncated)');
  } catch (err) {
    console.error('Could not connect to Ghost Persona API.');
    console.error('Make sure it is running: GHOST_PROJECT_ROOT=/your/project node apps/api/dist/index.js');
  }
}

main();
