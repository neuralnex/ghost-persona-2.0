import { FastifyInstance } from 'fastify';

export async function contextRoutes(fastify: FastifyInstance) {
  /**
   * GET /context/brief
   * Primary endpoint for AI coding agents.
   * Returns structured project context ready for injection into agent prompts.
   */
  fastify.get('/brief', async (request, reply) => {
    try {
      const brief = await fastify.engine.getContextBrief();
      return reply.code(200).send({
        ...brief,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.code(500).send({
        error: 'Failed to generate context brief',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /context/brief/markdown
   * Returns full AI-ready briefing as Markdown text.
   * Paste directly into an AI agent prompt.
   */
  fastify.get('/brief/markdown', async (request, reply) => {
    try {
      const brief = await fastify.engine.generateBrief();
      return reply
        .code(200)
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .send(brief);
    } catch (err) {
      return reply.code(500).send({
        error: 'Failed to generate markdown brief',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /context/search?q=<query>
   * Semantic search across project memory.
   */
  fastify.get<{ Querystring: { q?: string } }>('/search', async (request, reply) => {
    const query = request.query.q;

    if (!query || query.trim().length === 0) {
      return reply.code(400).send({ error: 'Query parameter "q" is required' });
    }

    try {
      const results = await fastify.engine.search(query);
      return reply.code(200).send({
        query,
        results,
        count: results.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.code(500).send({
        error: 'Search failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  /**
   * GET /context/status
   */
  fastify.get('/status', async (request, reply) => {
    const status = fastify.engine.getStatus();
    return reply.code(200).send(status);
  });
}
