/**
 * The real timer functions, captured when this module loads.
 *
 * `vi.useFakeTimers()` reassigns `globalThis.setTimeout` and friends, and
 * marks each fake with a `clock` property. TestStore waits for events on the
 * real clock — a `receive()` or `finish()` must never move the fake one, and
 * a safety tick must fire whether or not the test faked time — so it binds
 * these at load and refuses to load while the clock is already faked: bound
 * then, they would be the fakes, and every wait would silently be a fake
 * wait (R1-REVIEW 1.6).
 *
 * Internal: not in any barrel. `src/lib/test/animation.ts` shares it.
 */

type SetTimeout = typeof globalThis.setTimeout;
type ClearTimeout = typeof globalThis.clearTimeout;

/** `true` when the global timers are sinon fakes (vitest's `useFakeTimers`). */
export function timersAreFaked(): boolean {
	return typeof (globalThis.setTimeout as SetTimeout & { clock?: unknown }).clock !== 'undefined';
}

/**
 * Throws when the clock is faked at the moment the test module loads. A
 * setup file that fakes the clock at top level is the one way the capture
 * below could lie; the message says what to move.
 */
export function assertRealTimersAtImport(): void {
	if (timersAreFaked()) {
		throw new Error(
			'[TestStore] imported while timers are faked: call vi.useFakeTimers() inside a test or a ' +
				'beforeEach hook, not at the top level of a setup file, so the test module can bind the real clock.'
		);
	}
}

assertRealTimersAtImport();

export const realSetTimeout: SetTimeout = globalThis.setTimeout;
export const realClearTimeout: ClearTimeout = globalThis.clearTimeout;

/** Wait `ms` of real time, whatever the fake clock says. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		realSetTimeout(resolve, ms);
	});
}
