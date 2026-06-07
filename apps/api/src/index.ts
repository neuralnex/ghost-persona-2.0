import Fastify from 'fastify';
import cors from '@fastify/cors';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { contextRoutes } from './routes/context.js';
import { memoryRoutes } from './routes/memory.js';
import { snapshotRoutes } from './routes/snapshots.js';
import { healthRoutes } from './routes/health.js';

export interface ApiServerOptions {
  projectRoot?: string;
  port?: number;
  host?: string;
}

export async function createServer(options: ApiServerOptions = {}) {
  const projectRoot = options.projectRoot ?? process.cwd();
  const port = options.port ?? 7337;
  const host = options.host ?? '127.0.0.1';

  const fastify = Fastify({
    logger: {
      level: 'warn',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // CORS — allow local AI tools (Cursor, Claude Code, etc.)
  await fastify.register(cors, {
    origin: [
      'http://localhost:*',
      'http://127.0.0.1:*',
      'vscode-webview://*',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // Initialize memory engine
  const engine = await MemoryEngine.fromDirectory(projectRoot);
  const initResult = await engine.initialize();

  if (!initResult.success) {
    throw new Error(`Failed to initialize memory engine: ${initResult.error.message}`);
  }

  // Attach engine to fastify instance
  fastify.decorate('engine', engine);

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(contextRoutes, { prefix: '/context' });
  await fastify.register(memoryRoutes, { prefix: '/memory' });
  await fastify.register(snapshotRoutes, { prefix: '/snapshots' });

  // Root info
  fastify.get('/', async () => ({
    name: 'Ghost Persona API',
    version: '0.1.0',
    description: 'AI coding agent context API',
    endpoints: {
      health: 'GET /health',
      brief: 'GET /context/brief',
      search: 'GET /context/search?q=<query>',
      memory: 'GET /memory/:file',
      memoryAll: 'GET /memory',
      snapshots: 'GET /snapshots',
      createSnapshot: 'POST /snapshots',
    },
    docs: 'https://github.com/ghost-persona/ghost-persona#api',
  }));

  return { fastify, port, host };
}

export async function startServer(options: ApiServerOptions = {}) {
  const { fastify, port, host } = await createServer(options);

  try {
    await fastify.listen({ port, host });
    console.log(`👻 Ghost Persona API running at http://${host}:${port}`);
    return fastify;
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    engine: MemoryEngine;
  }
}

// CLI entry
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  startServer({
    projectRoot: process.env.GHOST_PROJECT_ROOT ?? process.cwd(),
    port: process.env.GHOST_PORT ? parseInt(process.env.GHOST_PORT) : 7337,
  });
}
