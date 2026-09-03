/**
 * Test-only controls, registered **only** when `createServer({ testing: true })`.
 *
 * The vitest suite needs none of this: it builds a whole server per file, so
 * isolation is free. This exists for Playwright, where one long-lived process
 * serves many tests and something has to put the state back.
 *
 * Two properties make it safe rather than a hole. The route is **not
 * registered** when the flag is off — it 404s through the normal handler, so
 * there is no runtime check on a header that could be tricked. And `main.ts`
 * refuses to boot with it enabled in production.
 */

import type { FastifyInstance } from 'fastify';

import type { ServerContext } from '../server.js';

export async function testingRoutes(
	app: FastifyInstance,
	options: { context: ServerContext }
): Promise<void> {
	const { store, now, idleMs, absoluteMs } = options.context;

	app.post('/__test__/reset', async (_request, reply) => {
		await store.seed();
		return reply.status(204).send();
	});

	/** The links this server would have emailed. Playwright's mail catcher. */
	app.get('/__test__/outbox', async (_request, reply) => {
		return reply.status(200).send({ sent: store.outbox });
	});
}
