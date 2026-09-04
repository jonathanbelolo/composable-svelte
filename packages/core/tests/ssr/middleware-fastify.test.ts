/**
 * The two plugins through a real Fastify instance, registered the documented
 * way.
 *
 * `tests/ssr/middleware.test.ts` drives them with a stub that records hooks.
 * A stub cannot show what Fastify does with `register` — run the plugin on an
 * encapsulated child, whose hooks never reach the registering instance's
 * routes — which is exactly what went wrong: the documented
 * `app.register(fastifySecurityHeaders)` installed no headers on any root
 * route (AUDIT-2026-09-03-FINDINGS SS3, G5, DA-C5). Node config; fastify is a
 * devDependency pinned to the version the examples use.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { fastifySecurityHeaders, fastifyRateLimit } from '../../src/lib/ssr/middleware/index.js';

const apps: FastifyInstance[] = [];
afterEach(async () => {
	while (apps.length) await apps.pop()!.close();
});
function createApp(): FastifyInstance {
	const app = Fastify();
	apps.push(app);
	return app;
}

describe('app.register(fastifySecurityHeaders) — the documented form', () => {
	it('reaches a root route', async () => {
		// The headers every configuration sets. Fastify passes `{}` when no
		// options are given, so the defaults are R1.6.b's test, below.
		const app = createApp();
		await app.register(fastifySecurityHeaders);
		app.get('/', async () => 'ok');

		const res = await app.inject('/');
		expect(res.statusCode).toBe(200);
		expect(res.headers['x-content-type-options']).toBe('nosniff');
		expect(res.headers['x-xss-protection']).toBe('1; mode=block');
	});

	it('honours options passed through register — the docs/README.md snippet', async () => {
		const app = createApp();
		await app.register(fastifySecurityHeaders, {
			contentSecurityPolicy: "default-src 'none'",
			frameOptions: 'SAMEORIGIN'
		});
		app.get('/', async () => 'ok');

		const res = await app.inject('/');
		expect(res.headers['content-security-policy']).toBe("default-src 'none'");
		expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
	});

	it('still works called directly with the instance — the example\'s form', async () => {
		const app = createApp();
		fastifySecurityHeaders(app, { frameOptions: 'SAMEORIGIN' });
		app.get('/', async () => 'ok');

		expect((await app.inject('/')).headers['x-frame-options']).toBe('SAMEORIGIN');
	});
});

describe('app.register(fastifyRateLimit, { max, windowMs }) — the documented form', () => {
	it('429s the second request on a root route', async () => {
		const app = createApp();
		await app.register(fastifyRateLimit, { max: 1, windowMs: 60_000 });
		app.get('/', async () => 'ok');

		const first = await app.inject('/');
		expect(first.statusCode).toBe(200);
		expect(first.headers['x-ratelimit-remaining']).toBe('0');

		const second = await app.inject('/');
		expect(second.statusCode).toBe(429);
		expect(Number(second.headers['retry-after'])).toBeGreaterThan(0);
		expect(second.json()).toMatchObject({ error: 'Too Many Requests' });
	});
});
