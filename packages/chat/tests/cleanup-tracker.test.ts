/**
 * `CleanupTracker` leaked a closure on every tracked timer.
 *
 * `setTimeout` and `setInterval` each did two things: added the handle to a Set,
 * and pushed a closure into `cleanups[]` that would clear it. Nothing ever
 * removed that closure — not `clearTimeout`, not the timer firing. So
 * `resourceCount` grew by one per call, for the life of the tracker.
 *
 * The closures were not merely un-removed, they were **redundant**: `dispose()`
 * iterates `timers` and `intervals` and clears them directly *before* running
 * `cleanups`, so by the time each closure ran its own `has()` check was already
 * false and it did nothing. They existed only to grow the array.
 *
 * That made this a leak for every caller of the tracker, not just the one that
 * surfaced it. `useTypingEmitter` is where it bites in practice: it starts an
 * auto-stop timer on every keystroke.
 *
 * The second half is `useTypingEmitter`'s own bug — it registered timers through
 * the tracker but cancelled them with the *global* `clearTimeout`, so the
 * handles accumulated in the `timers` Set as well. `CleanupTracker.clearTimeout`
 * is the method that fixes it, and it had zero call sites in the entire repo.
 *
 * These are the first tests of either file.
 */

import { describe, it, expect } from 'vitest';
import { CleanupTracker } from '../src/lib/streaming-chat/cleanup-tracker.js';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('CleanupTracker resource accounting', () => {
	it('does not grow when a timer is cleared through it', () => {
		const tracker = new CleanupTracker();

		for (let i = 0; i < 50; i += 1) {
			const t = tracker.setTimeout(() => {}, 10_000);
			tracker.clearTimeout(t);
		}

		expect(tracker.resourceCount, 'a cleared timer left a closure behind').toBe(0);
		tracker.dispose();
	});

	it('does not grow when a timer is allowed to fire', async () => {
		const tracker = new CleanupTracker();

		for (let i = 0; i < 20; i += 1) tracker.setTimeout(() => {}, 1);
		await wait(40);

		expect(tracker.resourceCount, 'a fired timer left a closure behind').toBe(0);
		tracker.dispose();
	});

	it('still cancels outstanding timers on dispose', async () => {
		// The control for the two above: removing the bookkeeping must not remove
		// the cleanup. `dispose()` clears the timer Set directly, which is why the
		// per-timer closures were redundant in the first place.
		const tracker = new CleanupTracker();
		let fired = 0;
		tracker.setTimeout(() => {
			fired += 1;
		}, 20);

		tracker.dispose();
		await wait(60);

		expect(fired, 'dispose failed to cancel a pending timer').toBe(0);
	});

	it('still runs explicitly added cleanups on dispose', () => {
		const tracker = new CleanupTracker();
		let ran = 0;
		tracker.add(() => {
			ran += 1;
		});

		expect(tracker.resourceCount, 'an explicit cleanup should be counted').toBe(1);
		tracker.dispose();

		expect(ran).toBe(1);
		expect(tracker.disposed).toBe(true);
	});
});

describe('resourceCount', () => {
	// It counted only `cleanups[]`. Timers and intervals stopped pushing into
	// that array when the per-keystroke leak was fixed, so this reported `0` for
	// a tracker holding live timers — wrong in the reassuring direction, for a
	// getter whose only plausible use is checking that nothing leaked.

	it('counts live timers and intervals, not just cleanups', () => {
		const tracker = new CleanupTracker();

		tracker.setTimeout(() => {}, 10_000);
		tracker.setInterval(() => {}, 10_000);
		tracker.add(() => {});

		expect(tracker.resourceCount).toBe(3);
		tracker.dispose();
	});

	it('drops back to zero once everything is disposed', () => {
		const tracker = new CleanupTracker();
		tracker.setTimeout(() => {}, 10_000);
		tracker.setInterval(() => {}, 10_000);
		tracker.dispose();

		expect(tracker.resourceCount).toBe(0);
	});
});
