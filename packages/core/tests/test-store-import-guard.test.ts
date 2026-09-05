/**
 * The test module binds the real clock when it loads (`real-timers.ts`), so
 * it refuses to load while the clock is faked: bound then, every wait in
 * `receive()` and `finish()` would silently be a fake wait (R1-REVIEW 1.6).
 * This file fakes the clock at top level, as a setup file would, and imports
 * — waiting for the evaluation before restoring the clock.
 */

import { describe, it, expect, vi } from 'vitest';

vi.useFakeTimers();
let loadError: unknown;
try {
	await import('../src/lib/test/test-store.js');
} catch (error) {
	loadError = error;
} finally {
	vi.useRealTimers();
}

describe('the test module refuses to load while timers are faked', () => {
	it('the import throws, naming what to move', () => {
		expect(loadError).toBeInstanceOf(Error);
		expect((loadError as Error).message).toMatch(/\[TestStore\] imported while timers are faked/);
	});

	it('assertRealTimersAtImport() is the same check, and timersAreFaked() reads the fake', async () => {
		// The module refused to load above and stays failed; a fresh evaluation
		// under real timers exposes the predicate.
		const fresh = '../src/lib/test/real-timers.js?real';
		const { assertRealTimersAtImport, timersAreFaked } = (await import(/* @vite-ignore */ fresh)) as typeof import('../src/lib/test/real-timers.js');
		expect(timersAreFaked()).toBe(false);
		expect(() => assertRealTimersAtImport()).not.toThrow();
		vi.useFakeTimers();
		try {
			expect(timersAreFaked()).toBe(true);
			expect(() => assertRealTimersAtImport()).toThrow(/imported while timers are faked/);
		} finally {
			vi.useRealTimers();
		}
	});
});
