/**
 * HTTP session deps — runtime wire validation.
 *
 * Stubs global `fetch`. A 200 whose body is not a valid session snapshot
 * must REJECT (typed `MalformedSessionError`) — a garbage payload must never
 * fail OPEN into an authenticated subject.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpSessionDeps, MalformedSessionError } from '../src/lib/session/http';
import { isAuthError, toAuthError } from '../src/lib/errors/helpers';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

function stubFetch(response: Response): void {
	vi.stubGlobal('fetch', vi.fn(async () => response));
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('createHttpSessionDeps — wire validation', () => {
	it('accepts a well-formed session payload', async () => {
		stubFetch(jsonResponse({ subject_id: 'abc', roles: ['agent'] }));

		await expect(createHttpSessionDeps().fetchSession()).resolves.toEqual({
			subject_id: 'abc',
			roles: ['agent']
		});
	});

	it('rejects a 200 with a garbage payload (fail-closed, not fail-open)', async () => {
		stubFetch(jsonResponse({ wat: 42, nested: { junk: true } }));

		await expect(createHttpSessionDeps().fetchSession()).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('rejects a non-object body', async () => {
		stubFetch(jsonResponse('definitely-not-a-session'));

		await expect(createHttpSessionDeps().fetchSession()).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('rejects a non-string subject_id', async () => {
		stubFetch(jsonResponse({ subject_id: 12345, roles: [] }));

		await expect(createHttpSessionDeps().fetchSession()).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('rejects roles present but not an array', async () => {
		stubFetch(jsonResponse({ subject_id: 'abc', roles: 'agent' }));

		await expect(createHttpSessionDeps().fetchSession()).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});

	it('tolerates an absent roles field (subjectFromSession defaults it to [])', async () => {
		stubFetch(jsonResponse({ subject_id: 'abc' }));

		await expect(createHttpSessionDeps().fetchSession()).resolves.toEqual({
			subject_id: 'abc'
		});
	});

	it('still resolves null on 401 (anonymous — no body validation involved)', async () => {
		stubFetch(new Response(null, { status: 401 }));

		await expect(createHttpSessionDeps().fetchSession()).resolves.toBeNull();
	});

	it('validates login payloads too — a malformed login body rejects', async () => {
		stubFetch(jsonResponse({ token: 'not-a-session' }));

		await expect(createHttpSessionDeps().fetchLogin('seeded-agent')).rejects.toBeInstanceOf(
			MalformedSessionError
		);
	});
});

describe('createHttpSessionDeps — failure reporting', () => {
	// None of this had any coverage. The three calls used to throw
	// `new Error('Login failed (401)')` — a status in a sentence with the body
	// discarded, which is the precise defect `http/errors.ts` was written to fix
	// and then only fixed for the flow surface.

	it('reads a login refusal as an AuthError, not a sentence', async () => {
		stubFetch(
			jsonResponse(
				{ error: { code: 'invalid_credentials', message: 'That password is not right.' } },
				401
			)
		);

		const thrown = await createHttpSessionDeps()
			.fetchLogin('seeded-agent')
			.then(() => null)
			.catch((error: unknown) => error);

		expect(isAuthError(thrown), 'a bare Error escaped the adapter').toBe(true);
		expect(thrown).toMatchObject({ code: 'invalid_credentials' });
	});

	it('maps a bare 401 by status, with no body to read', async () => {
		stubFetch(new Response(null, { status: 401 }));

		await expect(createHttpSessionDeps().fetchLogin('seeded-agent')).rejects.toMatchObject({
			code: 'invalid_credentials'
		});
	});

	it('reports an unexpected resolve failure as unknown, carrying the status', async () => {
		stubFetch(new Response(null, { status: 500 }));

		await expect(createHttpSessionDeps().fetchSession()).rejects.toMatchObject({
			code: 'unknown',
			status: 500
		});
	});

	it('reports a sign-out failure as an AuthError', async () => {
		stubFetch(new Response(null, { status: 500 }));

		const thrown = await createHttpSessionDeps()
			.fetchLogout()
			.then(() => null)
			.catch((error: unknown) => error);

		expect(isAuthError(thrown)).toBe(true);
	});

	it('reports a transport failure as network, in a sentence a person can read', async () => {
		// The whole point of wrapping `fetch`: this used to escape as a raw
		// `TypeError`, and reached a user as "fetch failed" if it was classified
		// at all — engine phrasings outside the four the heuristic knows became
		// `unknown`.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('terminated');
			})
		);

		const thrown = await createHttpSessionDeps()
			.fetchSession()
			.then(() => null)
			.catch((error: unknown) => error);

		expect(isAuthError(thrown), 'a raw TypeError escaped the adapter').toBe(true);
		expect(thrown).toMatchObject({ code: 'network' });
		expect((thrown as { message: string }).message).toContain('Could not reach the server');
	});

	it('makes a malformed payload satisfy the AuthError contract', async () => {
		// `AuthDependencies` promises every member rejects with an `AuthError`.
		// This one rejects with a class, and both have to be true at once: the
		// `instanceof` that consumers branch on, and the structural shape the
		// contract names.
		stubFetch(jsonResponse({ nope: true }));

		const thrown = await createHttpSessionDeps()
			.fetchSession()
			.then(() => null)
			.catch((error: unknown) => error);

		expect(thrown).toBeInstanceOf(MalformedSessionError);
		expect(isAuthError(thrown), 'the named error class is not an AuthError').toBe(true);
		expect((thrown as { code: string }).code).toBe('unknown');
	});

	it('survives the SSR round trip that would otherwise eat its message', async () => {
		// `Error.prototype.message` is non-enumerable, so `JSON.stringify` on the
		// raw class yields `{"code":"unknown"}` — and core hydrates SSR state
		// exactly that way. `toAuthError` copies it into a plain object, which is
		// what makes the explanation survive.
		stubFetch(jsonResponse({ nope: true }));

		const thrown = await createHttpSessionDeps()
			.fetchSession()
			.then(() => null)
			.catch((error: unknown) => error);

		const raw = JSON.parse(JSON.stringify(thrown)) as { message?: string };
		expect(raw.message, 'precondition: a raw Error loses its message').toBeUndefined();

		const hydrated = JSON.parse(JSON.stringify(toAuthError(thrown))) as {
			code: string;
			message: string;
		};
		expect(hydrated.code).toBe('unknown');
		expect(hydrated.message).toContain('Malformed session payload');
	});

	it('lets an abort through untouched', async () => {
		// A cancellation is not a failure. `toAuthError` classifies it, core drops
		// the dispatch anyway, and a caller holding its own signal has to keep
		// being able to tell the two apart.
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new DOMException('The operation was aborted.', 'AbortError');
			})
		);

		const thrown = await createHttpSessionDeps()
			.fetchSession()
			.then(() => null)
			.catch((error: unknown) => error);

		expect((thrown as { name?: string })?.name).toBe('AbortError');
	});
});
