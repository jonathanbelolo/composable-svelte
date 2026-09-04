/**
 * What the hand-rolled double could not do.
 *
 * `local-storage.test.ts` built its own in-memory `Storage` and used it 48
 * times; it now imports the shipped one instead, which is the proof that
 * `createMockStorage` is a drop-in for what a caller actually wrote by hand.
 *
 * This file covers the parts that hand-rolled one had no way to reach:
 * `subscribe`, which nothing in this repository had ever exercised, and the
 * serialization fidelity a `Map<string, T>` hides.
 */

import { describe, expect, it, vi } from 'vitest';
import { expectConsole } from '../helpers/console.js';

import { createMockStorage } from '../../src/lib/dependencies/local-storage.js';

describe('cross-tab events', () => {
	it('fires subscribers when another context writes', () => {
		const storage = createMockStorage<string>();
		const seen = vi.fn();
		storage.setItem('k', 'first');

		storage.subscribe(seen);
		storage.simulateSetItem('k', 'second', 'https://example.test/page');

		expect(seen).toHaveBeenCalledTimes(1);
		expect(seen).toHaveBeenCalledWith({
			key: 'k',
			newValue: 'second',
			oldValue: 'first',
			url: 'https://example.test/page'
		});
	});

	it('does NOT fire for this context’s own writes', () => {
		// The contract `SyncStorage.subscribe` states — "only fires for changes
		// from different browsing contexts" — and what every browser does: no
		// `storage` event is delivered to the tab that caused it. A double that
		// fired here would model a contract the real thing does not have, which
		// is worse than having no double at all.
		const storage = createMockStorage<string>();
		const seen = vi.fn();

		storage.subscribe(seen);
		storage.setItem('k', 'v');
		storage.removeItem('k');
		storage.clear();

		expect(seen).not.toHaveBeenCalled();
	});

	it('makes the simulated write readable', () => {
		const storage = createMockStorage<string>();
		storage.subscribe(() => {});
		storage.simulateSetItem('k', 'v');
		expect(storage.getItem('k')).toBe('v');
	});

	it('reports a removal as a null newValue', () => {
		const storage = createMockStorage<string>();
		storage.setItem('k', 'v');
		const seen = vi.fn();
		storage.subscribe(seen);

		storage.simulateRemoveItem('k');

		expect(seen).toHaveBeenCalledWith({ key: 'k', newValue: null, oldValue: 'v', url: '' });
		expect(storage.getItem('k')).toBeNull();
	});

	it('stops delivering after unsubscribe', () => {
		const storage = createMockStorage<string>();
		const seen = vi.fn();
		const stop = storage.subscribe(seen);

		stop();
		storage.simulateSetItem('k', 'v');

		expect(seen).not.toHaveBeenCalled();
	});

	it('lets one throwing listener not stop the others', () => {
		const storage = createMockStorage<string>();
		expectConsole('error');
		const second = vi.fn();

		storage.subscribe(() => {
			throw new Error('listener blew up');
		});
		storage.subscribe(second);
		storage.simulateSetItem('k', 'v');

		expect(second).toHaveBeenCalledTimes(1);
	});
});

describe('fidelity to real storage', () => {
	it('stores serialized strings, so a Date comes back as one', () => {
		// The point of the double. A `Map<string, T>` would hand the live `Date`
		// straight back and the test would pass where production would not.
		const storage = createMockStorage<{ at: Date }>();
		const at = new Date('2026-01-01T00:00:00.000Z');

		storage.setItem('k', { at });

		expect(typeof storage.getItem('k')?.at).toBe('string');
		expect(storage.data['k']).toBe('{"at":"2026-01-01T00:00:00.000Z"}');
	});

	it('honours the validator on read', () => {
		// Testable here for the first time: `createNoopStorage` reads back `null`
		// for everything, so it cannot distinguish "rejected" from "absent".
		const storage = createMockStorage<string>({
			validator: (value): value is string => typeof value === 'string'
		});
		storage.setItem('good', 'a string');
		storage.simulateSetItem('bad', 42 as unknown as string);

		expect(storage.getItem('good')).toBe('a string');
		expect(storage.getItem('bad')).toBeNull();
	});

	it('delivers null to subscribers for a value the validator rejects', () => {
		const storage = createMockStorage<string>({
			validator: (value): value is string => typeof value === 'string'
		});
		const seen = vi.fn();
		storage.subscribe(seen);

		storage.simulateSetItem('k', 99 as unknown as string);

		expect(seen).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'k', newValue: null })
		);
	});

	it('applies the prefix on write and strips it on read', () => {
		const storage = createMockStorage<string>({ prefix: 'app:' });
		storage.setItem('k', 'v');

		expect(storage.keys()).toEqual(['k']);
		expect(Object.keys(storage.data)).toEqual(['app:k']);
	});
});

describe('reset', () => {
	it('empties the store and drops every subscriber', () => {
		const storage = createMockStorage<string>();
		const seen = vi.fn();
		storage.subscribe(seen);
		storage.setItem('k', 'v');

		storage.reset();

		expect(storage.size()).toBe(0);
		storage.simulateSetItem('k', 'again');
		expect(seen, 'listeners survived reset').not.toHaveBeenCalled();
	});
});

describe('as an injected dependency', () => {
	it('lets a consumer react to another tab writing', () => {
		// End to end: the first proof that a consumer subscribing through the
		// `Storage` dependency actually receives anything.
		const storage = createMockStorage<{ theme: string }>({ prefix: 'prefs:' });
		const applied: string[] = [];

		const stop = storage.subscribe((event) => {
			if (event.key === 'settings' && event.newValue) applied.push(event.newValue.theme);
		});

		storage.simulateSetItem('settings', { theme: 'dark' });
		storage.simulateSetItem('settings', { theme: 'light' });
		stop();
		storage.simulateSetItem('settings', { theme: 'ignored' });

		expect(applied).toEqual(['dark', 'light']);
	});
});
