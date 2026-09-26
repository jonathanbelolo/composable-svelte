/// <reference types="node" />
/**
 * Two server requests through the real HTTP adapter and managed auth feature.
 * Each request creates its own store and passes a fetch bound to that incoming
 * request's cookie. Node's fetch does not forward browser cookies on its own.
 */
import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from '@composable-svelte/core';

import { createAuthFeature } from '../../src/lib/application/index.js';
import { createHttpAuthDeps } from '../../src/lib/http/index.js';

const seenCookies: string[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];
afterEach(async () => {
	await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
	seenCookies.length = 0;
});

describe('server request and cookie isolation', () => {
	it('keeps two concurrent request-bound auth sessions separate', async () => {
		const auth = createAuthFeature();
		let origin = '';
		const server = createServer(async (request, response) => {
			if (request.url === '/auth/session') {
				const cookie = request.headers.cookie ?? '';
				seenCookies.push(cookie);
				const who = cookie === 'session=ada' ? 'ada' : cookie === 'session=bob' ? 'bob' : null;
				if (who === null) { response.writeHead(401).end(); return; }
				await new Promise((resolve) => setTimeout(resolve, who === 'ada' ? 30 : 5));
				response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
					subject_id: who, display_name: who, roles: []
				}));
				return;
			}
			if (request.url !== '/app') { response.writeHead(404).end(); return; }

			const inboundCookie = request.headers.cookie ?? '';
			const scopedFetch: typeof fetch = (input, init) => {
				const headers = new Headers(init?.headers);
				headers.set('cookie', inboundCookie);
				return fetch(input, { ...init, headers });
			};
			const deps = createHttpAuthDeps(origin, { fetch: scopedFetch });
			const store = createStore({
				initialState: auth.initialState(),
				reducer: auth.composition.reducer,
				execution: auth.composition.execution,
				dependencies: deps,
				ssr: { deferEffects: false }
			});
			try {
				store.dispatch({ type: 'session', action: { type: 'resolveSession' } });
				await vi.waitFor(() => expect(store.state.session.status).toBe('authenticated'));
				const subject = store.state.session.subject;
				if (subject.kind !== 'authenticated') throw new Error('session did not resolve');
				response.writeHead(200, { 'content-type': 'text/html' }).end(
					`<main data-subject="${subject.id}">${subject.id}</main>`
				);
			} catch (error) {
				response.writeHead(500).end(String(error));
			} finally {
				store.destroy();
			}
		});
		servers.push(server);
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const address = server.address();
		if (typeof address !== 'object' || address === null) throw new Error('missing server port');
		origin = `http://127.0.0.1:${address.port}`;

		const [ada, bob] = await Promise.all([
			fetch(`${origin}/app`, { headers: { cookie: 'session=ada' } }),
			fetch(`${origin}/app`, { headers: { cookie: 'session=bob' } })
		]);
		const [adaHtml, bobHtml] = await Promise.all([ada.text(), bob.text()]);
		expect(ada.status).toBe(200);
		expect(bob.status).toBe(200);
		expect(adaHtml).toContain('data-subject="ada"');
		expect(adaHtml).not.toContain('bob');
		expect(bobHtml).toContain('data-subject="bob"');
		expect(bobHtml).not.toContain('ada');
		expect(seenCookies.sort()).toEqual(['session=ada', 'session=bob']);
		expect(adaHtml).not.toContain('session=');
		expect(bobHtml).not.toContain('session=');
	});
});
