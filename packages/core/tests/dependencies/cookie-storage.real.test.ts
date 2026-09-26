/**
 * The real cookie storage against a real `document.cookie`.
 *
 * `cookie-storage.test.ts` imports only `createMockCookieStorage`, so until
 * this file the encoding, size budget, attribute handling and removal of
 * `createCookieStorage` had no test at all, and the mock diverged from it in
 * exactly those places (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, D4,
 * D16). The former defect pins now assert healthy parsing and fresh-instance clearing.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createCookieStorage } from '../../src/lib/dependencies/cookie-storage.js';

/** Expire every cookie the page can see, under both attribute shapes this file sets. */
function clearAllCookies(): void {
	for (const pair of document.cookie.split(';')) {
		const name = pair.split('=')[0]?.trim();
		if (!name) continue;
		document.cookie = `${name}=; Path=/; Max-Age=0`;
		document.cookie = `${name}=; Path=/; Domain=${location.hostname}; Max-Age=0`;
	}
}

afterEach(clearAllCookies);

describe('createCookieStorage in a real browser', () => {
	it('round-trips a value through document.cookie and removes it', () => {
		const storage = createCookieStorage<{ n: number }>({ prefix: 'real-' });

		storage.setItem('k', { n: 1 });
		expect(document.cookie).toContain('real-k=');
		expect(storage.getItem('k')).toEqual({ n: 1 });

		storage.removeItem('k');
		expect(document.cookie).not.toContain('real-k=');
		expect(storage.getItem('k')).toBeNull();
	});

	it('isolates a malformed foreign cookie from healthy reads', () => {
		document.cookie = 'promo=50%off; Path=/';
		const storage = createCookieStorage<string>({ prefix: 'own-' });
		storage.setItem('k', 'healthy');
		expect(storage.getItem('k')).toBe('healthy');
		expect(storage.has('k')).toBe(true);
		expect(storage.keys()).toEqual(['k']);
		expect(storage.size()).toBe(1);
	});

	it('clears visible cookies through a fresh instance', () => {
		const first = createCookieStorage<string>({ prefix: 'd6-' });
		first.setItem('session', 'abc');
		expect(document.cookie).toContain('d6-session=');
		const reloaded = createCookieStorage<string>({ prefix: 'd6-' });
		reloaded.clear();
		expect(document.cookie).not.toContain('d6-session=');
		expect(reloaded.getItem('session')).toBeNull();
	});
});
