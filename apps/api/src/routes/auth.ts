import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import path from 'path';

export async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /auth/token
   * Generate a JWT token for project access
   * Requires projectId in body
   */
  fastify.post<{ Body: { projectId: string; audience?: string } }>('/token', async (request, reply) => {
    try {
      const { projectId, audience = 'ghost-api' } = request.body;
      
      if (!projectId) {
        return reply.code(400).send({ error: 'projectId is required' });
      }
      
      // Verify project exists by checking if .ghost/config.json exists
      const configPath = path.join(process.cwd(), '.ghost', 'config.json');
      try {
        const config = JSON.parse(readFileSync(configPath, 'utf-8'));
        if (config.projectName !== projectId && path.basename(process.cwd()) !== projectId) {
          return reply.code(403).send({ 
            error: 'Project ID does not match configured project',
            hint: 'Use the project name from .ghost/config.json'
          });
        }
      } catch {
        // If config doesn't exist, still generate token for the path
        if (!path.basename(process.cwd()).includes(projectId)) {
          return reply.code(403).send({ 
            error: 'Project verification failed',
            hint: 'Ensure you are in the correct project directory'
          });
        }
      }
      
      const token = fastify.generateProjectToken(projectId, audience);
      
      return reply.code(200).send({
        token,
        projectId,
        audience,
        expiresIn: '7d',
        scope: 'memory:read memory:write'
      });
    } catch (err) {
      return reply.code(500).send({
        error: 'Failed to generate token',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /auth/validate
   * Validate a JWT token
   * Requires Authorization: Bearer <token> header
   */
  fastify.get('/validate', async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.code(401).send({ error: 'Authorization header missing or invalid' });
      }
      
      const token = authHeader.substring(7);
      const query = request.query as { projectId?: string };
      const projectId = query.projectId;
      
      if (!projectId) {
        return reply.code(400).send({ error: 'projectId query parameter is required' });
      }
      
      const isValid = await fastify.verifyProjectToken(token, projectId);
      
      if (!isValid) {
        return reply.code(403).send({ error: 'Invalid or expired token' });
      }
      
      return reply.code(200).send({
        valid: true,
        projectId,
        message: 'Token is valid'
      });
    } catch (err) {
      return reply.code(500).send({
        error: 'Token validation failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /auth/project-token
   * Get a pre-generated project token from config
   * This allows projects to have persistent tokens stored in config.json
   */
  fastify.get('/project-token', async (request, reply) => {
    try {
      const configPath = path.join(process.cwd(), '.ghost', 'config.json');
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const projectId = config.projectName || path.basename(process.cwd());
      
      // Generate a token for this project
      const token = fastify.generateProjectToken(projectId, 'ghost-api');
      
      return reply.code(200).send({
        projectId,
        token,
        expiresIn: '7d'
      });
    } catch (err) {
      // If config doesn't exist, return error
      return reply.code(404).send({
        error: 'Project not initialized',
        hint: 'Run ghost init in this directory first'
      });
    }
  });
}
