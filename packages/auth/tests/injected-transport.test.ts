import { describe, expect, it, vi } from 'vitest';

import { createHttpAuthDeps } from '../src/lib/http/index.js';
import { createHttpSessionDeps } from '../src/lib/session/http.js';

describe('injected transport', () => {
	it('routes session dependencies through injected fetch', async () => {
		const customFetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({ subject_id: 'sub-1', roles: ['admin'] }),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		const deps = createHttpSessionDeps('http://localhost:3000', { fetch: customFetch });
		const session = await deps.fetchSession();

		expect(customFetch).toHaveBeenCalledTimes(1);
		expect(customFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/session',
			expect.objectContaining({ method: 'GET', credentials: 'include' })
		);
		expect(session).toEqual({ subject_id: 'sub-1', roles: ['admin'] });
	});

	it('routes full auth dependencies through injected fetch', async () => {
		const customFetch = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					email: 'test@example.com',
					email_verified: true,
					has_password: true,
					mfa_enabled: false,
					providers: [],
					pending_email: null
				}),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		const deps = createHttpAuthDeps('http://localhost:3000', { fetch: customFetch });
		const account = await deps.fetchAccount();

		expect(customFetch).toHaveBeenCalledTimes(1);
		expect(customFetch).toHaveBeenCalledWith(
			'http://localhost:3000/auth/account',
			expect.objectContaining({ method: 'GET', credentials: 'include' })
		);
		expect(account.email).toBe('test@example.com');
	});

	it('preserves request-time default global fetch when no fetch is injected', async () => {
		const originalFetch = globalThis.fetch;
		const mockGlobal = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({ subject_id: 'global-user', roles: [] }),
				{ status: 200, headers: { 'content-type': 'application/json' } }
			)
		);
		const deps = createHttpAuthDeps('http://localhost:3000');
		try {
			globalThis.fetch = mockGlobal;
			await deps.fetchLogin('global-user');
			expect(mockGlobal).toHaveBeenCalledTimes(1);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it('classifies network failures from injected fetch as AuthError with code network', async () => {
		const customFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
		const deps = createHttpAuthDeps('http://localhost:3000', { fetch: customFetch });

		await expect(deps.fetchAccount()).rejects.toMatchObject({ code: 'network' });
	});

	it('passes AbortError through untouched when signal is aborted', async () => {
		const abortError = new Error('The operation was aborted');
		abortError.name = 'AbortError';
		const customFetch = vi.fn().mockRejectedValue(abortError);

		const controller = new AbortController();
		controller.abort();

		const deps = createHttpAuthDeps('http://localhost:3000', { fetch: customFetch });
		await expect(deps.fetchAccount(controller.signal)).rejects.toBe(abortError);
		expect(customFetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
	});
});
