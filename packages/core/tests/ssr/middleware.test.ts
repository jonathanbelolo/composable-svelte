/**
 * Coverage for the SSR middleware.
 *
 * These three modules had no tests at all before they were moved onto the
 * `@composable-svelte/core/ssr/middleware` subpath — including `sanitizeHTML`,
 * which is a security function. The move itself was mechanical; this is here to
 * show it preserved behaviour, and so the code is not left uncovered.
 *
 * Node environment: `sanitizeHTML` reaches isomorphic-dompurify, which resolves
 * to a jsdom-backed build under Node. It lives at `./ssr/sanitize`; the other two
 * are on `./ssr/middleware` and have no dependencies at all.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	createSecurityHeaders,
	defaultSecurityHeaders,
	fastifySecurityHeaders
} from '../../src/lib/ssr/middleware/security-headers.js';
import {
	sanitizeHTML,
	createSanitizer,
	defaultSanitizeOptions
} from '../../src/lib/ssr/sanitize.js';
import {
	RateLimiter,
	fastifyRateLimit
} from '../../src/lib/ssr/middleware/rate-limiting.js';

/** Minimal stand-in for the parts of Fastify these plugins touch. */
function stubFastify() {
	const hooks: Record<string, (req: any, reply: any) => Promise<void>> = {};
	return {
		addHook(name: string, fn: (req: any, reply: any) => Promise<void>) {
			hooks[name] = fn;
		},
		async fire(name: string, req: any, reply: any) {
			await hooks[name]?.(req, reply);
		},
		has(name: string) {
			return name in hooks;
		}
	};
}

/** Records what a route handler wrote back. */
function stubReply() {
	const headers: Record<string, unknown> = {};
	return {
		headers,
		statusCode: 200 as number,
		body: undefined as unknown,
		header(k: string, v: unknown) {
			headers[k] = v;
			return this;
		},
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		send(payload: unknown) {
			this.body = payload;
			return this;
		}
	};
}

describe('security headers', () => {
	it('always sets the sniffing and XSS headers', () => {
		const headers = createSecurityHeaders({});
		expect(headers['X-Content-Type-Options']).toBe('nosniff');
		expect(headers['X-XSS-Protection']).toBe('1; mode=block');
	});

	it('merges over the defaults, so an empty config is the defaults', () => {
		expect(createSecurityHeaders({})).toEqual(createSecurityHeaders());
		expect(createSecurityHeaders({})['X-Frame-Options']).toBe('DENY');
	});

	it('a field set to false drops that header, and the rest stay', () => {
		const headers = createSecurityHeaders({ frameOptions: false, hsts: false });
		expect(headers).not.toHaveProperty('X-Frame-Options');
		expect(headers).not.toHaveProperty('Strict-Transport-Security');
		expect(headers['Content-Security-Policy']).toBe(defaultSecurityHeaders.contentSecurityPolicy);
	});

	it('applies the documented defaults', () => {
		const headers = createSecurityHeaders();
		expect(headers['X-Frame-Options']).toBe('DENY');
		expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
		expect(headers['Content-Security-Policy']).toBe(
			defaultSecurityHeaders.contentSecurityPolicy
		);
		expect(headers['Strict-Transport-Security']).toBe(
			'max-age=31536000; includeSubDomains'
		);
	});

	it('omits CSP when it is explicitly disabled', () => {
		const headers = createSecurityHeaders({ contentSecurityPolicy: false });
		expect(headers).not.toHaveProperty('Content-Security-Policy');
	});

	it('renders hsts from an object, honouring includeSubDomains', () => {
		expect(
			createSecurityHeaders({ hsts: { maxAge: 60 } })['Strict-Transport-Security']
		).toBe('max-age=60');
		expect(
			createSecurityHeaders({ hsts: { maxAge: 60, includeSubDomains: true } })[
				'Strict-Transport-Security'
			]
		).toBe('max-age=60; includeSubDomains');
	});

	it('merges custom headers over the generated ones', () => {
		const headers = createSecurityHeaders({
			frameOptions: 'SAMEORIGIN',
			customHeaders: { 'X-Frame-Options': 'DENY', 'X-Custom': 'yes' }
		});
		expect(headers['X-Frame-Options']).toBe('DENY');
		expect(headers['X-Custom']).toBe('yes');
	});

	it('registers an onRequest hook that writes the headers to the reply', async () => {
		const fastify = stubFastify();
		fastifySecurityHeaders(fastify, { frameOptions: 'SAMEORIGIN' });
		expect(fastify.has('onRequest')).toBe(true);

		const reply = stubReply();
		await fastify.fire('onRequest', {}, reply);
		expect(reply.headers['X-Frame-Options']).toBe('SAMEORIGIN');
		expect(reply.headers['X-Content-Type-Options']).toBe('nosniff');
	});
});

describe('HTML sanitisation', () => {
	it('strips a script tag but keeps the surrounding content', () => {
		const out = sanitizeHTML('<script>alert("XSS")</script><p>Hello</p>');
		expect(out).not.toContain('script');
		expect(out).toContain('Hello');
	});

	it('returns an empty string for empty input', () => {
		expect(sanitizeHTML('')).toBe('');
	});

	it('keeps tags on the default allow-list', () => {
		const out = sanitizeHTML('<p>a <strong>b</strong> <em>c</em></p>');
		expect(out).toContain('<strong>');
		expect(out).toContain('<em>');
	});

	it('drops tags that are not on the allow-list', () => {
		// `iframe` is absent from defaultSanitizeOptions.allowedTags.
		expect(defaultSanitizeOptions.allowedTags).not.toContain('iframe');
		expect(sanitizeHTML('<iframe src="http://evil.test"></iframe><p>ok</p>')).not.toContain(
			'iframe'
		);
	});

	it('strips an inline event handler', () => {
		expect(sanitizeHTML('<p onclick="steal()">text</p>')).not.toContain('onclick');
	});

	it('honours a narrowed allow-list', () => {
		const out = sanitizeHTML('<p>keep</p><strong>drop</strong>', { allowedTags: ['p'] });
		expect(out).toContain('keep');
		expect(out).not.toContain('<strong>');
	});

	it('createSanitizer binds its options', () => {
		const sanitize = createSanitizer({ allowedTags: ['p'] });
		expect(sanitize('<p>keep</p><em>drop</em>')).not.toContain('<em>');
	});
});

describe('rate limiting', () => {
	const limiters: RateLimiter[] = [];
	const track = (l: RateLimiter) => (limiters.push(l), l);

	afterEach(() => {
		// The constructor starts a cleanup interval; leaving it running holds the
		// process open.
		while (limiters.length) limiters.pop()!.destroy();
		vi.useRealTimers();
	});

	it('refuses a max or windowMs that is not a positive finite number', () => {
		expect(() => new RateLimiter({ max: NaN, windowMs: 1000 })).toThrow(/RateLimitConfig\.max/);
		expect(() => new RateLimiter({ max: 1, windowMs: 0 })).toThrow(/RateLimitConfig\.windowMs/);
		expect(() => new RateLimiter(undefined as never)).toThrow(/max.*got undefined/);
	});

	it('allows requests under the limit and counts down remaining', () => {
		const limiter = track(new RateLimiter({ max: 3, windowMs: 1000 }));
		expect(limiter.check('a')).toMatchObject({ allowed: true, remaining: 2 });
		expect(limiter.check('a')).toMatchObject({ allowed: true, remaining: 1 });
		expect(limiter.check('a')).toMatchObject({ allowed: true, remaining: 0 });
	});

	it('blocks once the limit is reached, with a retryAfter', () => {
		const limiter = track(new RateLimiter({ max: 1, windowMs: 1000 }));
		limiter.check('a');
		const blocked = limiter.check('a');
		expect(blocked.allowed).toBe(false);
		expect(blocked.remaining).toBe(0);
		expect(blocked.retryAfter).toBeGreaterThan(0);
	});

	it('tracks keys independently', () => {
		const limiter = track(new RateLimiter({ max: 1, windowMs: 1000 }));
		expect(limiter.check('a').allowed).toBe(true);
		expect(limiter.check('b').allowed).toBe(true);
		expect(limiter.check('a').allowed).toBe(false);
	});

	it('allows again once the window has elapsed', () => {
		vi.useFakeTimers();
		const limiter = track(new RateLimiter({ max: 1, windowMs: 1000 }));
		expect(limiter.check('a').allowed).toBe(true);
		expect(limiter.check('a').allowed).toBe(false);

		vi.advanceTimersByTime(1001);
		expect(limiter.check('a').allowed).toBe(true);
	});

	it('caps the keys it holds, dropping the oldest', () => {
		// A client that chooses its own key could grow the map without limit.
		const limiter = track(new RateLimiter({ max: 1, windowMs: 60_000, maxKeys: 2 }));
		expect(limiter.check('a').allowed).toBe(true);
		expect(limiter.check('b').allowed).toBe(true);
		expect(limiter.check('c').allowed).toBe(true); // evicts a
		expect(limiter.size).toBe(2);
		expect(limiter.check('a').allowed).toBe(true); // a was evicted, so it is new again
		expect(limiter.check('c').allowed).toBe(false); // c is still held
		expect(limiter.size).toBe(2);
	});

	it('a client seen all along outlives fresh keys: eviction is by recency, not first sight', () => {
		// Map insertion order evicted the first-seen key, so a long-lived active
		// client was dropped (and its count reset) ahead of the spoofed keys
		// filling the map.
		const limiter = track(new RateLimiter({ max: 100, windowMs: 60_000, maxKeys: 3 }));
		limiter.check('long-lived');
		limiter.check('b');
		limiter.check('long-lived'); // touched again: moves behind b
		limiter.check('c');
		limiter.check('long-lived');
		limiter.check('spoof-1'); // at capacity: evicts b, the least recently seen
		limiter.check('spoof-2'); // evicts c
		expect(limiter.size).toBe(3);
		expect(limiter.check('long-lived').remaining).toBe(100 - 4); // its fourth request, still counted (first-seen eviction reset it to 99)
	});

	it('does not hold the process open: the cleanup interval is unref\'d', () => {
		const spy = vi.spyOn(globalThis, 'setInterval');
		try {
			track(new RateLimiter({ max: 1, windowMs: 1000 }));
			const handle = spy.mock.results.at(-1)!.value as NodeJS.Timeout;
			expect(handle.hasRef()).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});

	it('registers an onClose hook that destroys the limiter', async () => {
		vi.useFakeTimers();
		const fastify = stubFastify();
		fastifyRateLimit(fastify, { max: 1, windowMs: 1000 });
		expect(fastify.has('onClose')).toBe(true);
		expect(vi.getTimerCount()).toBe(1);

		await fastify.fire('onClose', undefined, undefined);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('sets rate-limit headers and 429s once exceeded', async () => {
		const fastify = stubFastify();
		fastifyRateLimit(fastify, { max: 1, windowMs: 1000 });

		const first = stubReply();
		await fastify.fire('onRequest', { ip: '1.2.3.4' }, first);
		expect(first.headers['X-RateLimit-Limit']).toBe(1);
		expect(first.headers['X-RateLimit-Remaining']).toBe(0);
		expect(first.statusCode).toBe(200);

		const second = stubReply();
		await fastify.fire('onRequest', { ip: '1.2.3.4' }, second);
		expect(second.statusCode).toBe(429);
		expect(second.headers['Retry-After']).toBeGreaterThan(0);
		expect(second.body).toMatchObject({ error: 'Too Many Requests' });
		await fastify.fire('onClose', undefined, undefined);
	});

	it('uses a custom key generator when given one', async () => {
		const fastify = stubFastify();
		fastifyRateLimit(fastify, {
			max: 1,
			windowMs: 1000,
			keyGenerator: (req: any) => req.headers['x-api-key']
		});

		const a = stubReply();
		await fastify.fire('onRequest', { headers: { 'x-api-key': 'k1' } }, a);
		const b = stubReply();
		await fastify.fire('onRequest', { headers: { 'x-api-key': 'k2' } }, b);
		expect(a.statusCode).toBe(200);
		expect(b.statusCode).toBe(200);

		const c = stubReply();
		await fastify.fire('onRequest', { headers: { 'x-api-key': 'k1' } }, c);
		expect(c.statusCode).toBe(429);
		await fastify.fire('onClose', undefined, undefined);
	});
});
