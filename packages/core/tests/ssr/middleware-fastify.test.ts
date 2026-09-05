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

import { describe, it, expect, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { fastifySecurityHeaders, fastifyRateLimit, type RateLimitConfig } from '../../src/lib/ssr/middleware/index.js';

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

	it('registered without options, or with an empty object, applies the defaults', async () => {
		// Fastify passes `{}` to a plugin registered without options, and the
		// first form fell back to the defaults only when the argument was
		// absent — so the documented one-liner set two headers and no policy.
		for (const options of [undefined, {}]) {
			const app = createApp();
			if (options === undefined) await app.register(fastifySecurityHeaders);
			else await app.register(fastifySecurityHeaders, options);
			app.get('/', async () => 'ok');

			const res = await app.inject('/');
			expect(res.headers['x-frame-options']).toBe('DENY');
			expect(res.headers['content-security-policy']).toContain("default-src 'self'");
			expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
			expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
		}
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

describe('app.register(fastifyRateLimit) with a bad config', () => {
	it('registered without options, ready() rejects naming max', async () => {
		// The first form reached check() with NaN and every request was a 500.
		// TypeScript refuses `register(fastifyRateLimit)` with no options, so
		// this is the JavaScript caller's mistake: Fastify hands the plugin `{}`
		// either way.
		const app = createApp();
		app.register(fastifyRateLimit, {} as RateLimitConfig);
		await expect(app.ready()).rejects.toThrow(/RateLimitConfig\.max must be a positive finite number, got undefined/);
	});

	it.each([
		[{ max: NaN, windowMs: 1000 }, /max.*got NaN/],
		[{ max: 0, windowMs: 1000 }, /max.*got 0/],
		[{ max: 10, windowMs: Infinity }, /windowMs.*got Infinity/],
		[{ max: 10, windowMs: -1 }, /windowMs.*got -1/]
	])('%o rejects at ready()', async (config, message) => {
		const app = createApp();
		app.register(fastifyRateLimit, config as { max: number; windowMs: number });
		await expect(app.ready()).rejects.toThrow(message);
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

describe('the limiter goes with the server', () => {
	it('app.close() clears the cleanup interval', async () => {
		// The interval was never cleared, so app.close() waited on it (SS8).
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		try {
			const app = Fastify();
			await app.register(fastifyRateLimit, { max: 1, windowMs: 60_000 });
			await app.ready();
			expect(vi.getTimerCount()).toBe(1);

			await app.close();
			expect(vi.getTimerCount()).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('the plugins compose with fastify-plugin (R1-REVIEW 1.3)', () => {
	it('fp(plugin) wraps without throwing and still installs on the root', async () => {
		// The marker was defined non-writable; fastify-plugin assigns it in
		// strict mode and threw "Cannot assign to read only property".
		const app = createApp();
		await app.register(fp(fastifySecurityHeaders));
		app.get('/', async () => 'ok');
		expect((await app.inject('/')).headers['x-frame-options']).toBe('DENY');
	});

	it('fp(plugin, { encapsulate: true }) is honoured: the hook stays in the child', async () => {
		const app = createApp();
		await app.register(fp(fastifyRateLimit, { encapsulate: true }), { max: 1, windowMs: 60_000 });
		app.get('/', async () => 'ok');
		await app.inject('/');
		expect((await app.inject('/')).statusCode).toBe(200);
	});
});

describe('the direct-call form fails closed (R1-REVIEW 1.4)', () => {
	it('a bad config throws synchronously when the plugin is called directly', () => {
		const app = createApp();
		expect(() => fastifyRateLimit(app, {} as RateLimitConfig)).toThrow(/RateLimitConfig\.max/);
	});

	it('the direct call installs synchronously and returns an already-resolved promise', async () => {
		const app = createApp();
		const returned = fastifySecurityHeaders(app, { frameOptions: 'SAMEORIGIN' });
		app.get('/', async () => 'ok');
		await returned;
		expect((await app.inject('/')).headers['x-frame-options']).toBe('SAMEORIGIN');
	});
});

