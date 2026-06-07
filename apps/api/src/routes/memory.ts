import { FastifyInstance } from 'fastify';
import { MEMORY_FILES, MemoryFileName } from '@ghost-persona/shared';

export async function memoryRoutes(fastify: FastifyInstance) {
  /**
   * GET /memory
   * Returns all memory files as a map.
   */
  fastify.get('/', async (request, reply) => {
    try {
      // We access the markdown generator indirectly via the engine's brief
      const brief = await fastify.engine.getContextBrief();
      return reply.code(200).send({
        files: MEMORY_FILES,
        brief,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });

  /**
   * GET /memory/:file
   * Returns a specific memory file as Markdown.
   */
  fastify.get<{ Params: { file: string } }>('/:file', async (request, reply) => {
    const { file } = request.params;

    if (!MEMORY_FILES.includes(file as MemoryFileName)) {
      return reply.code(404).send({
        error: 'Memory file not found',
        available: MEMORY_FILES,
      });
    }

    try {
      const brief = await fastify.engine.getContextBrief();
      // For direct file access, expose the brief content mapped by name
      const content = (brief as unknown as Record<string, unknown>)[file.replace('.md', '')] ?? '';
      return reply
        .code(200)
        .header('Content-Type', 'text/markdown; charset=utf-8')
        .send(content);
    } catch (err) {
      return reply.code(500).send({ error: String(err) });
    }
  });
}
