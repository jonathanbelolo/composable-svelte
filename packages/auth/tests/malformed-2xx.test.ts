import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpSessionDeps, MalformedSessionError } from '../src/lib/session/http.js';

const original = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = original;
});

/** A 200 whose body is not JSON at all — an HTML proxy page or SPA fallback. */
function htmlResponse(): Response {
	return new Response('<html>Proxy error</html>', { status: 200, headers: { 'content-type': 'text/html' } });
}

describe('a 2xx carrying a non-JSON body', () => {
	it('fetchSession reports it as MalformedSessionError', async () => {
		globalThis.fetch = vi.fn(async () => htmlResponse()) as never;
		await expect(createHttpSessionDeps().fetchSession()).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('fetchLogin reports it as MalformedSessionError', async () => {
		globalThis.fetch = vi.fn(async () => htmlResponse()) as never;
		await expect(createHttpSessionDeps().fetchLogin('u1')).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});
});
