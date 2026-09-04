/**
 * The real cookie storage against a real `document.cookie`.
 *
 * `cookie-storage.test.ts` imports only `createMockCookieStorage`, so until
 * this file the encoding, size budget, attribute handling and removal of
 * `createCookieStorage` had no test at all, and the mock diverged from it in
 * exactly those places (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, D4,
 * D16). R0.3.c lands the harness, a round-trip, and two pins; the behaviour
 * tests arrive with R2.5.
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

	it('D5 (pinned defect): one foreign cookie with a raw percent sign makes every read throw', () => {
		// Pinned, not fixed: the parser decodes every cookie on the page, not
		// only its own, and does not guard the decode. A cookie set by a server
		// or another script (`promo=50%off`) makes getItem, has, keys and size
		// throw URIError for every key. Fails the moment R2.5.a guards the
		// decode; remove it in that commit. AUDIT-2026-09-03-FINDINGS D5.
		document.cookie = 'promo=50%off; Path=/';
		const storage = createCookieStorage<string>({ prefix: 'own-' });

		expect(() => storage.getItem('k')).toThrow(URIError);
	});

	it('D6 (pinned defect): clear() by a fresh instance removes nothing', () => {
		// Pinned, not fixed: the registry that remembers what this storage set is
		// per instance, and clear() iterates only the registry — so after a
		// reload, clear() (the documented logout step) leaves every cookie in
		// place. Fails the moment R2.5.b reads document.cookie instead; remove
		// it in that commit. AUDIT-2026-09-03-FINDINGS D6.
		//
		// The other half of D6 — removeItem() omitting Domain= for a cookie set
		// with one — cannot be shown here: Chromium refuses Domain=localhost, the
		// origin this suite runs on (verified by a precondition that failed). R2.5
		// must cover it on a dotted host, or by reading the fallback at
		// cookie-storage.ts:239 directly.
		const first = createCookieStorage<string>({ prefix: 'd6-' });
		first.setItem('session', 'abc');
		expect(document.cookie).toContain('d6-session=');

		const reloaded = createCookieStorage<string>({ prefix: 'd6-' });
		reloaded.clear();

		expect(document.cookie).toContain('d6-session=');
	});
});
