/**
 * Tests for storage boundaries (B006-4, B006-5, B006-6).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCookieStorage } from '../../src/lib/dependencies/cookie-storage.js';
import { createLocalStorage } from '../../src/lib/dependencies/local-storage.js';

function clearAllCookies(): void {
	if (typeof document === 'undefined') return;
	for (const pair of document.cookie.split(';')) {
		const name = pair.split('=')[0]?.trim();
		if (!name) continue;
		document.cookie = `${name}=; Path=/; Max-Age=0`;
		document.cookie = `${name}=; Path=/; Domain=${location.hostname}; Max-Age=0`;
	}
}

describe('Storage Boundaries (B006-4, B006-5, B006-6)', () => {
	beforeEach(() => {
		clearAllCookies();
		localStorage.clear();
		sessionStorage.clear();
	});

	afterEach(() => {
		clearAllCookies();
		localStorage.clear();
		sessionStorage.clear();
		vi.restoreAllMocks();
	});

	describe('B006-4: Cookie clear across instance lifecycles', () => {
		it('clears cookies matching prefix even after instance recreation', () => {
			const first = createCookieStorage<string>({ prefix: 'b0064-' });
			first.setItem('token', 'auth-123');
			expect(document.cookie).toContain('b0064-token=');

			const fresh = createCookieStorage<string>({ prefix: 'b0064-' });
			fresh.clear();

			expect(document.cookie).not.toContain('b0064-token=');
			expect(fresh.getItem('token')).toBeNull();
			expect(fresh.keys()).toEqual([]);
		});

		it('does not clear unrelated cookies when prefix is configured', () => {
			document.cookie = 'other-app=keep; Path=/';
			const storage = createCookieStorage<string>({ prefix: 'scoped-' });
			storage.setItem('mine', 'val');

			expect(document.cookie).toContain('other-app=');
			expect(document.cookie).toContain('scoped-mine=');

			storage.clear();

			expect(document.cookie).not.toContain('scoped-mine=');
			expect(document.cookie).toContain('other-app=');
		});

		it('preserves registered per-cookie path options when clearing', () => {
			const storage = createCookieStorage<string>({ prefix: 'path-', path: '/different-configured-path' });
			storage.setItem('sub', 'val', { path: '/' });
			expect(document.cookie).toContain('path-sub=');

			storage.clear();
			expect(document.cookie).not.toContain('path-sub=');
		});
	});

	describe('B006-5: Malformed percent-encoded cookies', () => {
		it('does not throw URIError or poison healthy entries on read operations', () => {
			document.cookie = 'promo=50%off; Path=/';
			document.cookie = 'good-item=%22valid%22; Path=/';

			const storage = createCookieStorage<string>({ prefix: 'good-' });

			expect(() => storage.getItem('item')).not.toThrow();
			expect(storage.getItem('item')).toBe('valid');
			expect(storage.has('item')).toBe(true);
			expect(storage.keys()).toEqual(['item']);
			expect(storage.size()).toBe(1);
		});

		it('does not introduce raw key fallback that could cause key collision', () => {
			document.cookie = 'bad%key=value; Path=/';
			const storage = createCookieStorage<string>({ prefix: '' });

			expect(storage.has('bad%key')).toBe(false);
		});
	});

	describe('B006-6: Storage event listener lifecycle', () => {
		it('lazily attaches storage listener on first subscriber and detaches on last', () => {
			const addSpy = vi.spyOn(window, 'addEventListener');
			const removeSpy = vi.spyOn(window, 'removeEventListener');

			const storage = createLocalStorage<string>({ prefix: 'evt-' });
			expect(addSpy).not.toHaveBeenCalledWith('storage', expect.any(Function));

			const listener = vi.fn();
			const unsub = storage.subscribe(listener);

			expect(addSpy).toHaveBeenCalledTimes(1);
			expect(addSpy).toHaveBeenCalledWith('storage', expect.any(Function));
			const handler = addSpy.mock.calls[0]![1];

			unsub();
			expect(removeSpy).toHaveBeenCalledTimes(1);
			expect(removeSpy).toHaveBeenCalledWith('storage', handler);
		});

		it('handles repeated subscriptions for the same callback and idempotent unsubscribe', () => {
			const addSpy = vi.spyOn(window, 'addEventListener');
			const removeSpy = vi.spyOn(window, 'removeEventListener');

			const storage = createLocalStorage<string>({ prefix: 'evt-' });
			const listener = vi.fn();

			const unsub1 = storage.subscribe(listener);
			const unsub2 = storage.subscribe(listener);

			expect(addSpy).toHaveBeenCalledTimes(1);

			unsub1();
			unsub1(); // Idempotent check
			expect(removeSpy).not.toHaveBeenCalled();

			const event = new StorageEvent('storage', {
				key: 'evt-msg',
				newValue: JSON.stringify('active'),
				storageArea: window.localStorage
			});
			window.dispatchEvent(event);
			expect(listener).toHaveBeenCalledTimes(1);

			unsub2();
			expect(removeSpy).toHaveBeenCalledTimes(1);
		});

		it('filters out storageArea events belonging to sessionStorage', () => {
			const storage = createLocalStorage<string>({ prefix: 'sync-' });
			const listener = vi.fn();
			const unsub = storage.subscribe(listener);

			const sessionEvent = new StorageEvent('storage', {
				key: 'sync-test',
				newValue: JSON.stringify('ignored'),
				storageArea: window.sessionStorage
			});
			window.dispatchEvent(sessionEvent);
			expect(listener).not.toHaveBeenCalled();

			unsub();
		});
	});
});
