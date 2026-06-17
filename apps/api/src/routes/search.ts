import { FastifyPluginAsync } from 'fastify';

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /search - basic keyword search
  fastify.get('/search', async (request, reply) => {
    const { q: query } = request.query as { q?: string };
    
    if (!query) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const engine = request.server.engine;
    const results = await engine.search(query);

    return { query, results, count: results.length };
  });

  // GET /search/semantic - semantic search using vector embeddings
  fastify.get('/search/semantic', async (request, reply) => {
    const { q: query, limit, min_score: minScore, type } = request.query as {
      q?: string;
      limit?: string;
      min_score?: string;
      type?: string;
    };

    if (!query) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const engine = request.server.engine;
    const result = await engine.semanticSearch(query, {
      limit: limit ? parseInt(limit) : undefined,
      minScore: minScore ? parseFloat(minScore) : undefined,
      type,
    });

    if (!result.success) {
      return reply.status(500).send({ error: result.error.message });
    }

    return {
      query: result.data.query,
      results: result.data.results,
      total: result.data.total,
      averageScore: result.data.averageScore,
    };
  });

  // GET /search/query - natural language query
  fastify.get('/search/query', async (request, reply) => {
    const { q: query, limit } = request.query as { q?: string; limit?: string };

    if (!query) {
      return reply.status(400).send({ error: 'Query parameter "q" is required' });
    }

    const engine = request.server.engine;
    const result = await engine.queryNaturalLanguage(query, {
      limit: limit ? parseInt(limit) : undefined,
    });

    if (!result.success) {
      return reply.status(500).send({ error: result.error.message });
    }

    return {
      query: result.data.parsed.query,
      intent: result.data.parsed.intent,
      dateRange: result.data.parsed.dateRange,
      results: result.data.searchResult,
    };
  });

  // GET /changes/last-week - what changed last week
  fastify.get('/changes/last-week', async (request, reply) => {
    const { limit } = request.query as { limit?: string };
    const engine = request.server.engine;
    const result = await engine.whatChangedLastWeek();

    if (!result.success) {
      return reply.status(500).send({ error: result.error.message });
    }

    return {
      query: 'What changed last week?',
      results: result.data.results,
      total: result.data.total,
    };
  });

  // GET /changes/yesterday - what changed yesterday
  fastify.get('/changes/yesterday', async (request, reply) => {
    const engine = request.server.engine;
    const result = await engine.whatChangedYesterday();

    if (!result.success) {
      return reply.status(500).send({ error: result.error.message });
    }

    return {
      query: 'What changed yesterday?',
      results: result.data.results,
      total: result.data.total,
    };
  });

  // GET /changes/today - what changed today
  fastify.get('/changes/today', async (request, reply) => {
    const engine = request.server.engine;
    const result = await engine.whatChangedToday();

    if (!result.success) {
      return reply.status(500).send({ error: result.error.message });
    }

    return {
      query: 'What changed today?',
      results: result.data.results,
      total: result.data.total,
    };
  });
};
