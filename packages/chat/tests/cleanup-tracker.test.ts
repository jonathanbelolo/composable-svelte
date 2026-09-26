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
 * The second half was `useTypingEmitter`'s own bug — it registered timers through
 * the tracker but cancelled them with the *global* `clearTimeout`, so the
 * handles accumulated in the `timers` Set as well. `CleanupTracker.clearTimeout`
 * now handles those cancellations in collaborative-hooks.ts; the zero-call-site
 * observation describes the historical defect, not the current implementation.
 *
 * These are the first tests of either file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CleanupTracker } from '../src/lib/streaming-chat/cleanup-tracker.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

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
		await vi.advanceTimersByTimeAsync(40);

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
		await vi.advanceTimersByTimeAsync(60);

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

describe('post-disposal behavior and fake timer accounting', () => {
	it('does not create active interval or run callback when setInterval is called after dispose', () => {
		vi.useFakeTimers();
		try {
			const tracker = new CleanupTracker();
			tracker.dispose();

			let ticks = 0;
			const timer = tracker.setInterval(() => {
				ticks += 1;
			}, 100);

			expect(() => { tracker.clearInterval(timer); clearInterval(timer); }).not.toThrow();
			expect(vi.getTimerCount(), 'no active fake timers after post-dispose setInterval').toBe(0);
			vi.advanceTimersByTime(1000);
			expect(ticks, 'post-dispose interval callback should never fire').toBe(0);
			expect(tracker.resourceCount).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('does not create active timer or run callback when setTimeout is called after dispose', () => {
		vi.useFakeTimers();
		try {
			const tracker = new CleanupTracker();
			tracker.dispose();

			let fired = 0;
			const timer = tracker.setTimeout(() => {
				fired += 1;
			}, 100);

			expect(() => { tracker.clearTimeout(timer); clearTimeout(timer); }).not.toThrow();
			expect(vi.getTimerCount(), 'no active fake timers after post-dispose setTimeout').toBe(0);
			vi.advanceTimersByTime(1000);
			expect(fired, 'post-dispose timeout callback should never fire').toBe(0);
			expect(tracker.resourceCount).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('tracks active timers in fake timer accounting and clears them on dispose', () => {
		vi.useFakeTimers();
		try {
			const tracker = new CleanupTracker();
			let intervalTicks = 0;
			let timeoutFired = 0;

			tracker.setInterval(() => {
				intervalTicks += 1;
			}, 100);
			tracker.setTimeout(() => {
				timeoutFired += 1;
			}, 200);

			expect(vi.getTimerCount()).toBe(2);
			expect(tracker.resourceCount).toBe(2);

			vi.advanceTimersByTime(150);
			expect(intervalTicks).toBe(1);
			expect(timeoutFired).toBe(0);

			tracker.dispose();
			expect(vi.getTimerCount(), 'all fake timers cleared upon dispose').toBe(0);
			expect(tracker.resourceCount).toBe(0);

			vi.advanceTimersByTime(500);
			expect(intervalTicks).toBe(1);
			expect(timeoutFired).toBe(0);
		} finally {
			vi.useRealTimers();
		}
	});

	it('immediately runs cleanup added after dispose and safely catches errors', () => {
		const tracker = new CleanupTracker();
		tracker.dispose();

		let ran = false;
		tracker.add(() => {
			ran = true;
		});
		expect(ran).toBe(true);

		expect(() => {
			tracker.add(() => {
				throw new Error('cleanup error');
			});
		}).not.toThrow();
	});

	it('dispose is idempotent and safely handles throwing cleanups', () => {
		const tracker = new CleanupTracker();
		let cleanupsRun = 0;

		tracker.add(() => {
			cleanupsRun += 1;
			throw new Error('first cleanup error');
		});
		tracker.add(() => {
			cleanupsRun += 1;
		});

		expect(() => tracker.dispose()).not.toThrow();
		expect(cleanupsRun).toBe(2);
		expect(tracker.disposed).toBe(true);

		// Subsequent dispose call should be a no-op
		expect(() => tracker.dispose()).not.toThrow();
		expect(cleanupsRun).toBe(2);
	});

	it('does not add event listener or increase resource count when called after dispose', () => {
		const tracker = new CleanupTracker();
		tracker.dispose();

		const element = {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn()
		} as unknown as HTMLElement;

		tracker.addEventListener(element, 'click', () => {});
		expect(element.addEventListener).not.toHaveBeenCalled();
		expect(tracker.resourceCount).toBe(0);
	});
});


describe('review followups: tracked interval and native listener retirement', () => {
  it('clears an interval individually without disturbing another interval', () => {
    const tracker = new CleanupTracker(); const left = vi.fn(); const right = vi.fn();
    const first = tracker.setInterval(left, 10); const second = tracker.setInterval(right,10);
    vi.advanceTimersByTime(10); expect(left).toHaveBeenCalledTimes(1); expect(right).toHaveBeenCalledTimes(1);
    tracker.clearInterval(first); tracker.clearInterval(first);
    expect(tracker.resourceCount).toBe(1); expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(10); expect(left).toHaveBeenCalledTimes(1);expect(right).toHaveBeenCalledTimes(2);
    tracker.clearInterval(second);expect(tracker.resourceCount).toBe(0);tracker.dispose();expect(vi.getTimerCount()).toBe(0);
  });
  it('retires native once listener before invoking it and preserves receiver semantics', () => {
    const tracker = new CleanupTracker(); const target = new EventTarget();const counts:number[]=[];const receivers:unknown[]=[];
    tracker.addEventListener(target,'tick',function(this:EventTarget){counts.push(tracker.resourceCount);receivers.push(this);},{once:true});
    expect(tracker.resourceCount).toBe(1);target.dispatchEvent(new Event('tick'));target.dispatchEvent(new Event('tick'));
    expect(counts).toEqual([0]);expect(receivers).toEqual([target]);expect(tracker.resourceCount).toBe(0);tracker.dispose();
  });
  it('retires signal-aborted listeners and skips already-aborted registrations', () => {
    const tracker=new CleanupTracker();const target=new EventTarget();const signal=new AbortController();const callback=vi.fn();
    tracker.addEventListener(target,'tick',callback,{signal:signal.signal});expect(tracker.resourceCount).toBe(1);
    signal.abort();expect(tracker.resourceCount).toBe(0);target.dispatchEvent(new Event('tick'));expect(callback).not.toHaveBeenCalled();
    tracker.addEventListener(target,'tick',callback,{signal:signal.signal});expect(tracker.resourceCount).toBe(0);tracker.dispose();
  });
  it('returns an enrolled disposer and deduplicates native listener identities', () => {
    const tracker=new CleanupTracker();const target=new EventTarget();const callback=vi.fn();
    const release=tracker.addEventListener(target,'tick',callback);const duplicate=tracker.addEventListener(target,'tick',callback,{once:true});
    expect(tracker.resourceCount).toBe(1);target.dispatchEvent(new Event('tick'));target.dispatchEvent(new Event('tick'));expect(callback).toHaveBeenCalledTimes(2);
    release();duplicate();expect(tracker.resourceCount).toBe(0);target.dispatchEvent(new Event('tick'));expect(callback).toHaveBeenCalledTimes(2);tracker.dispose();
  });
  it('disposes with captured capture option and supports object listeners', () => {
    const tracker=new CleanupTracker();const target=new EventTarget();const listener={calls:0,handleEvent(){this.calls++;}};const options={capture:true};
    tracker.addEventListener(target,'tick',listener,options);options.capture=false;
    target.dispatchEvent(new Event('tick'));expect(listener.calls).toBe(1);tracker.dispose();target.dispatchEvent(new Event('tick'));expect(listener.calls).toBe(1);expect(tracker.resourceCount).toBe(0);
  });
  it('reentrant throwing late cleanup does not truncate its caller or later cleanup', () => {
    const tracker=new CleanupTracker();const trace:string[]=[];
    tracker.add(()=>{tracker.add(()=>{throw new Error('expected late cleanup');});trace.push('caller completed');});
    tracker.add(()=>trace.push('later'));expect(()=>tracker.dispose()).not.toThrow();expect(trace).toEqual(['caller completed','later']);expect(tracker.resourceCount).toBe(0);
  });
});
