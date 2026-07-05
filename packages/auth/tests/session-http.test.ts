/**
 * HTTP session deps — runtime wire validation.
 *
 * Stubs global `fetch`. A 200 whose body is not a valid session snapshot
 * must REJECT (typed `MalformedSessionError`) — a garbage payload must never
 * fail OPEN into an authenticated subject.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHttpSessionDeps, MalformedSessionError } from '../src/lib/session/http';

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
