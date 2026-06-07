import { FastifyInstance } from 'fastify';

export async function snapshotRoutes(fastify: FastifyInstance) {
  /**
   * POST /snapshots
   * Create a new project snapshot.
   */
  fastify.post<{
    Body: {
      currentGoal?: string;
      knownIssues?: string[];
      nextTasks?: string[];
      commit?: string;
      branch?: string;
    };
  }>('/', async (request, reply) => {
    try {
      const result = await fastify.engine.createSnapshot(request.body ?? {});

      if (!result.success) {
        return reply.code(500).send({
          error: 'Snapshot creation failed',
          message: result.error.message,
        });
      }

      return reply.code(201).send(result.data);
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });
}
