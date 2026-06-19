import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import { MemoryEngine } from '@ghost-persona/memory-engine';
import { contextRoutes } from './routes/context.js';
import { memoryRoutes } from './routes/memory.js';
import { snapshotRoutes } from './routes/snapshots.js';
import { healthRoutes } from './routes/health.js';
import { searchRoutes } from './routes/search.js';
import { authRoutes } from './routes/auth.js';
import { readFileSync } from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface ApiServerOptions {
  projectRoot?: string;
  port?: number;
  host?: string;
  jwtSecret?: string;
}

export async function createServer(options: ApiServerOptions = {}) {
  const projectRoot = options.projectRoot ?? process.cwd();
  const port = options.port ?? 7337;
  const host = options.host ?? '127.0.0.1';
  const jwtSecret = options.jwtSecret ?? process.env.JWT_SECRET ?? generateJwtSecret(projectRoot);

  const fastify = Fastify({
    logger: {
      level: 'warn',
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    },
  });

  // Store JWT secret on fastify instance
  fastify.decorate('jwtSecret', jwtSecret);

  // CORS — allow local AI tools (Cursor, Claude Code, etc.)
  await fastify.register(cors, {
    origin: [
      'http://localhost:*',
      'http://127.0.0.1:*',
      'vscode-webview://*',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // JWT authentication plugin
  await fastify.register(fastifyJwt, { secret: jwtSecret });

  // Initialize memory engine
  const engine = await MemoryEngine.fromDirectory(projectRoot);
  const initResult = await engine.initialize();

  if (!initResult.success) {
    throw new Error(`Failed to initialize memory engine: ${initResult.error.message}`);
  }

  // Attach engine to fastify instance
  fastify.decorate('engine', engine);
  
  // JWT token utilities
  fastify.decorate('generateProjectToken', function(this: FastifyInstance, projectId: string, audience: string = 'ghost-api') {
    return this.jwt.sign({ 
      projectId, 
      audience,
      scope: 'memory:read memory:write'
    }, { expiresIn: '7d' });
  });
  
  fastify.decorate('verifyProjectToken', async function(this: FastifyInstance, token: string, expectedProjectId: string) {
    try {
      const decoded = this.jwt.verify(token) as { projectId: string; audience: string; scope?: string };
      return decoded.projectId === expectedProjectId;
    } catch {
      return false;
    }
  });

  // Add preHandler hook for JWT authentication on protected routes
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url.startsWith('/context') || 
        routeOptions.url.startsWith('/memory') ||
        routeOptions.url.startsWith('/snapshots')) {
      routeOptions.preHandler = async (request, reply) => {
        // Skip JWT check for GET /context/brief and GET /context/brief/markdown for backwards compatibility
        if (routeOptions.method === 'GET' && 
            (routeOptions.url === '/context/brief' || 
             routeOptions.url === '/context/brief/markdown')) {
          return;
        }
        
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
          reply.code(401).send({ 
            error: 'Unauthorized',
            message: 'JWT token required for this endpoint',
            hint: 'Get a token from POST /auth/token'
          });
          throw new Error('Unauthorized');
        }
        
        const token = authHeader.substring(7);
        const projectId = require('path').basename(projectRoot);
        
        const isValid = await fastify.verifyProjectToken(token, projectId);
        if (!isValid) {
          reply.code(403).send({ 
            error: 'Forbidden',
            message: 'Invalid or expired JWT token',
            hint: 'Request a new token from POST /auth/token'
          });
          throw new Error('Forbidden');
        }
      };
    }
  });

  // Register routes
  await fastify.register(healthRoutes, { prefix: '/health' });
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(contextRoutes, { prefix: '/context' });
  await fastify.register(memoryRoutes, { prefix: '/memory' });
  await fastify.register(snapshotRoutes, { prefix: '/snapshots' });
  await fastify.register(searchRoutes, { prefix: '/search' });

  // Root info
  fastify.get('/', async () => ({
    name: 'Ghost Persona API',
    version: '0.3.0',
    description: 'AI coding agent context API with semantic search',
    endpoints: {
      health: 'GET /health',
      brief: 'GET /context/brief',
      briefMarkdown: 'GET /context/brief/markdown',
      contextSearch: 'GET /context/search?q=<query>',
      memory: 'GET /memory/:file',
      memoryAll: 'GET /memory',
      snapshots: 'GET /snapshots',
      createSnapshot: 'POST /snapshots',
      search: 'GET /search?q=<query>',
      semanticSearch: 'GET /search/semantic?q=<query>&limit=&min_score=&type=',
      query: 'GET /search/query?q=<natural-language-query>',
      changesLastWeek: 'GET /changes/last-week',
      changesYesterday: 'GET /changes/yesterday',
      changesToday: 'GET /changes/today',
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

// Helper function to generate a deterministic JWT secret for a project
function generateJwtSecret(projectRoot: string): string {
  // Use project path to generate a consistent secret
  const hash = crypto.createHash('sha256');
  hash.update(projectRoot);
  hash.update('ghost-persona-api-secret');
  return hash.digest('hex').substring(0, 64);
}

// Extend Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    engine: MemoryEngine;
    jwtSecret: string;
    generateProjectToken: (projectId: string, audience?: string) => string;
    verifyProjectToken: (token: string, expectedProjectId: string) => Promise<boolean>;
  }
}

// CLI entry
if (process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts')) {
  startServer({
    projectRoot: process.env.GHOST_PROJECT_ROOT ?? process.cwd(),
    port: process.env.GHOST_PORT ? parseInt(process.env.GHOST_PORT) : 7337,
  });
}
