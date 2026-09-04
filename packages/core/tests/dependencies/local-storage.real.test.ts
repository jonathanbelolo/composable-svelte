/**
 * The real localStorage and sessionStorage adapters against the browser's.
 *
 * `local-storage.test.ts` imports only `createMockStorage` and
 * `createNoopStorage`, so until this file `createLocalStorage` and
 * `createSessionStorage` had no test at all
 * (`plans/hardening/AUDIT-2026-09-03-FINDINGS.md`, D4). R0.3.c lands the
 * harness and a round-trip each; the behaviour tests arrive with R2.5.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createLocalStorage, createSessionStorage } from '../../src/lib/dependencies/local-storage.js';

afterEach(() => {
	localStorage.clear();
	sessionStorage.clear();
});

describe('createLocalStorage in a real browser', () => {
	it('round-trips a value through window.localStorage and removes it', () => {
		const storage = createLocalStorage<{ a: number }>({ prefix: 'real-' });

		storage.setItem('k', { a: 1 });
		expect(localStorage.getItem('real-k')).toBe(JSON.stringify({ a: 1 }));
		expect(storage.getItem('k')).toEqual({ a: 1 });

		storage.removeItem('k');
		expect(localStorage.getItem('real-k')).toBeNull();
		expect(storage.getItem('k')).toBeNull();
	});
});

describe('createSessionStorage in a real browser', () => {
	it('round-trips a value through window.sessionStorage and removes it', () => {
		const storage = createSessionStorage<string>({ prefix: 'real-' });

		storage.setItem('k', 'v');
		expect(sessionStorage.getItem('real-k')).toBe(JSON.stringify('v'));
		expect(storage.getItem('k')).toBe('v');

		storage.removeItem('k');
		expect(sessionStorage.getItem('real-k')).toBeNull();
	});
});
