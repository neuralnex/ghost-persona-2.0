import { FastifyInstance } from 'fastify';

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/', async (request, reply) => {
    const status = fastify.engine.getStatus();
    return reply.code(200).send({
      status: 'ok',
      ghost: {
        initialized: status.initialized,
        watching: status.watching,
        project: status.config.projectName,
      },
      timestamp: new Date().toISOString(),
    });
  });
}
