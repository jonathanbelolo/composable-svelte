/**
 * The scheduler must let go of the videos it watches.
 *
 * `UpdateScheduler` is the piece with the least conventional code in this
 * subsystem: to clean up a video's `play`/`pause` listeners it **rebinds its own
 * `unregisterElement` method** on `this`, wrapping the previous one. The chain
 * is never unwound — not on unregister, not in `destroy()` — so after n video
 * registrations every call walks n wrappers, and each wrapper's closure pins a
 * `HTMLVideoElement` and its registration for the scheduler's lifetime.
 */

import { describe, it, expect, vi } from 'vitest';
import { UpdateScheduler } from '../../src/lib/overlay/update-scheduler.js';
import type { ElementRegistration } from '../../src/lib/overlay/overlay-types.js';

/**
 * A `<video>` that supports `requestVideoFrameCallback` and counts its
 * listeners.
 *
 * jsdom implements neither, and `setupVideoUpdates` returns early without the
 * callback — so a test using a bare `<video>` would exercise none of this.
 */
function fakeVideo(options: { startId?: number } = {}) {
	// Typed as the DOM lib declares them, so the intersection does not widen the
	// callback into a union and defeat the `pending` map's type.
	const video = document.createElement('video') as HTMLVideoElement & {
		requestVideoFrameCallback: (cb: VideoFrameRequestCallback) => number;
		cancelVideoFrameCallback: (id: number) => void;
	};

	const listeners = new Map<string, number>();
	const realAdd = video.addEventListener.bind(video);
	const realRemove = video.removeEventListener.bind(video);

	video.addEventListener = ((type: string, ...rest: unknown[]) => {
		listeners.set(type, (listeners.get(type) ?? 0) + 1);
		return realAdd(type as never, ...(rest as [never]));
	}) as typeof video.addEventListener;

	video.removeEventListener = ((type: string, ...rest: unknown[]) => {
		listeners.set(type, (listeners.get(type) ?? 0) - 1);
		return realRemove(type as never, ...(rest as [never]));
	}) as typeof video.removeEventListener;

	let nextId = options.startId ?? 1;
	const pending = new Map<number, VideoFrameRequestCallback>();
	video.requestVideoFrameCallback = (cb) => {
		const id = nextId++;
		pending.set(id, cb);
		return id;
	};
	video.cancelVideoFrameCallback = (id) => void pending.delete(id);

	// jsdom reports `paused` as true and it is read-only.
	Object.defineProperty(video, 'paused', { value: false, configurable: true });
	Object.defineProperty(video, 'ended', { value: false, configurable: true });

	return {
		element: video,
		net: (type: string) => listeners.get(type) ?? 0,
		pendingCount: () => pending.size,
		/** Fire one video frame, as the browser would. */
		frame: () => {
			const batch = [...pending.entries()];
			pending.clear();
			batch.forEach(([, cb]) => cb(performance.now(), {} as VideoFrameCallbackMetadata));
		},
		pendingCallbacks: () => [...pending.values()]
	};
}

const videoRegistration = (id: string, element: HTMLVideoElement): ElementRegistration => ({
	id,
	element,
	type: 'video',
	updateStrategy: 'frame',
	shader: 'wave-gentle-horizontal',
	bounds: { x: 0, y: 0, width: 10, height: 10 },
});

describe('the scheduler releases a video it stops watching', () => {
	it('removes the play/pause listeners on unregister', () => {
		const scheduler = new UpdateScheduler();
		const video = fakeVideo();

		scheduler.registerElement(videoRegistration('a', video.element));
		expect(video.net('play'), 'no play listener was added').toBe(1);

		scheduler.unregisterElement('a');

		expect(video.net('play'), 'the play listener outlived the registration').toBe(0);
		expect(video.net('pause')).toBe(0);
		expect(video.net('ended')).toBe(0);
		scheduler.destroy();
	});

	it('removes them on destroy too, without an unregister', () => {
		// `destroy()` cancelled the frame callbacks and left the listeners: they
		// were removed only by the rebound `unregisterElement`, so tearing the
		// scheduler down without unregistering first leaked them onto the video.
		const scheduler = new UpdateScheduler();
		const video = fakeVideo();

		scheduler.registerElement(videoRegistration('a', video.element));
		scheduler.destroy();

		expect(video.net('play'), 'destroy left the play listener behind').toBe(0);
		expect(video.net('pause')).toBe(0);
		expect(video.net('ended')).toBe(0);
	});

	it('does not rebind unregisterElement per registration', () => {
		// The chain is invisible from outside except by identity: the method must
		// be the same function after n registrations as before.
		const scheduler = new UpdateScheduler();
		const before = scheduler.unregisterElement;

		for (let i = 0; i < 5; i += 1) {
			scheduler.registerElement(videoRegistration(`v${i}`, fakeVideo().element));
		}

		expect(
			scheduler.unregisterElement,
			'the scheduler wrapped its own method once per video'
		).toBe(before);
		scheduler.destroy();
	});
});

describe('a video frame uploads once', () => {
	it('notifies a single update per frame', () => {
		// A `frame`-strategy video is added to `frameUpdateElements` *and* given
		// an independent `requestVideoFrameCallback` loop. Both call
		// `notifyUpdate`, so every frame uploaded the texture twice — under a
		// comment calling rVFC "more efficient than requestAnimationFrame",
		// which reads as *instead of*, not *as well as*.
		//
		// Both loops have to be driven to see it: firing only the video frame
		// exercises the rVFC path alone and the count looks right.
		const queued: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			queued.push(cb);
			return queued.length;
		});
		vi.stubGlobal('cancelAnimationFrame', () => {});

		const scheduler = new UpdateScheduler();
		const video = fakeVideo();
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		scheduler.registerElement(videoRegistration('a', video.element));

		// One browser frame: the rAF loop ticks and the video presents a frame.
		queued.splice(0, queued.length).forEach((cb) => cb(performance.now()));
		video.frame();

		expect(
			notified.mock.calls.filter((c) => c[0] === 'a'),
			'the video texture was uploaded more than once for one frame'
		).toHaveLength(1);

		scheduler.destroy();
		vi.unstubAllGlobals();
	});

	it('still drives a video that has no requestVideoFrameCallback', () => {
		// The paired half. Handing the video sole ownership is only right when it
		// can actually drive itself; without the callback it must stay on the
		// animation-frame loop or it never updates at all.
		const queued: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			queued.push(cb);
			return queued.length;
		});
		vi.stubGlobal('cancelAnimationFrame', () => {});

		const scheduler = new UpdateScheduler();
		// Playing, not jsdom's default of paused: a paused video is skipped by
		// `shouldUpdateElement` and has nothing new to sample, so asserting on
		// one would test the wrong thing.
		const plain = document.createElement('video');
		Object.defineProperty(plain, 'paused', { value: false, configurable: true });
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		scheduler.registerElement(videoRegistration('a', plain));
		queued.splice(0, queued.length).forEach((cb) => cb(performance.now()));

		expect(
			notified.mock.calls.filter((c) => c[0] === 'a'),
			'a video without rVFC was dropped from the frame loop'
		).toHaveLength(1);

		scheduler.destroy();
		vi.unstubAllGlobals();
	});
});

describe('bounded video callback ownership and authority', () => {
	it('bounds pending callbacks to at most one across repeated play events', () => {
		const scheduler = new UpdateScheduler();
		const video = fakeVideo();
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		scheduler.registerElement(videoRegistration('v1', video.element));
		expect(video.pendingCount(), 'initial registration must schedule exactly one callback').toBe(1);

		for (let i = 0; i < 5; i++) {
			video.element.dispatchEvent(new Event('play'));
		}
		expect(video.pendingCount(), 'repeated play events must not duplicate callback registrations').toBe(1);

		video.frame();
		expect(notified).toHaveBeenCalledTimes(1);
		expect(video.pendingCount(), 'subsequent frame must continue bounded callback loop').toBe(1);

		scheduler.destroy();
		expect(video.pendingCount(), 'destroy must cancel pending video callback').toBe(0);
	});

	it('cancels callbacks on pause and ended events without leaking loops', () => {
		const scheduler = new UpdateScheduler();
		const video = fakeVideo();
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		scheduler.registerElement(videoRegistration('v1', video.element));
		expect(video.pendingCount()).toBe(1);

		Object.defineProperty(video.element, 'paused', { value: true, configurable: true });
		video.element.dispatchEvent(new Event('pause'));
		expect(video.pendingCount(), 'pause must cancel pending callback').toBe(0);

		// Play while paused should not schedule
		video.element.dispatchEvent(new Event('play'));
		expect(video.pendingCount()).toBe(0);

		// Resume
		Object.defineProperty(video.element, 'paused', { value: false, configurable: true });
		video.element.dispatchEvent(new Event('play'));
		expect(video.pendingCount()).toBe(1);

		// Ended
		Object.defineProperty(video.element, 'ended', { value: true, configurable: true });
		video.element.dispatchEvent(new Event('ended'));
		expect(video.pendingCount(), 'ended must cancel pending callback').toBe(0);

		scheduler.destroy();
	});

	it('correctly manages callbacks when requestVideoFrameCallback returns zero id', () => {
		const scheduler = new UpdateScheduler();
		const video = fakeVideo({ startId: 0 });

		scheduler.registerElement(videoRegistration('v0', video.element));
		expect(video.pendingCount(), 'zero callback id must be recorded as pending').toBe(1);

		video.element.dispatchEvent(new Event('pause'));
		expect(video.pendingCount(), 'pause must cancel callback even when id is zero').toBe(0);

		scheduler.destroy();
	});

	it('revokes authority and cleans previous video on re-registering the same id', () => {
		const scheduler = new UpdateScheduler();
		const video1 = fakeVideo();
		const video2 = fakeVideo();
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		scheduler.registerElement(videoRegistration('v', video1.element));
		expect(video1.pendingCount()).toBe(1);

		// Re-register same id with different element
		scheduler.registerElement(videoRegistration('v', video2.element));
		expect(video1.pendingCount(), 'previous video pending callback cancelled on re-register').toBe(0);
		expect(video1.net('play'), 'previous video listeners removed on re-register').toBe(0);
		expect(video2.pendingCount(), 'new video scheduled on re-register').toBe(1);

		video2.frame();
		expect(notified).toHaveBeenCalledTimes(1);
		expect(notified).toHaveBeenCalledWith('v');

		scheduler.destroy();
	});

	it('safely handles reentrant unregister, destroy, and replacement during callback execution', () => {
		// Reentrant unregister
		const scheduler1 = new UpdateScheduler();
		const video1 = fakeVideo();
		scheduler1.setUpdateCallback((id) => {
			scheduler1.unregisterElement(id);
		});
		scheduler1.registerElement(videoRegistration('a', video1.element));
		video1.frame();
		expect(video1.pendingCount(), 'reentrant unregister must not reschedule loop').toBe(0);
		scheduler1.destroy();

		// Reentrant destroy
		const scheduler2 = new UpdateScheduler();
		const video2 = fakeVideo();
		scheduler2.setUpdateCallback(() => {
			scheduler2.destroy();
		});
		scheduler2.registerElement(videoRegistration('b', video2.element));
		video2.frame();
		expect(video2.pendingCount(), 'reentrant destroy must not reschedule loop').toBe(0);

		// Reentrant replacement
		const scheduler3 = new UpdateScheduler();
		const video3 = fakeVideo();
		const replacement = fakeVideo();
		scheduler3.setUpdateCallback((id) => {
			scheduler3.registerElement(videoRegistration(id, replacement.element));
		});
		scheduler3.registerElement(videoRegistration('c', video3.element));
		video3.frame();
		expect(video3.pendingCount(), 'old element must not be rescheduled after reentrant replacement').toBe(0);
		expect(replacement.pendingCount(), 'replacement element should be scheduled').toBe(1);
		scheduler3.destroy();
	});

	it('ignores callback execution queued prior to cancellation', () => {
		const scheduler = new UpdateScheduler();
		const video = fakeVideo();
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		scheduler.registerElement(videoRegistration('v1', video.element));
		const queuedCallbacks = video.pendingCallbacks();
		expect(queuedCallbacks).toHaveLength(1);

		scheduler.unregisterElement('v1');
		expect(video.pendingCount()).toBe(0);

		// Trigger callback that was already queued prior to cancellation
		queuedCallbacks.forEach((cb) => cb(performance.now(), {} as VideoFrameCallbackMetadata));
		expect(notified, 'stale queued callback must not notify update').not.toHaveBeenCalled();
		expect(video.pendingCount(), 'stale queued callback must not restart loop').toBe(0);

		scheduler.destroy();
	});

	it('preserves compatibility for manual and static strategies alongside frame', () => {
		const scheduler = new UpdateScheduler();
		const notified = vi.fn();
		scheduler.setUpdateCallback(notified);

		const canvas = document.createElement('canvas');
		scheduler.registerElement({
			id: 'canvas1',
			element: canvas,
			type: 'canvas',
			updateStrategy: 'manual',
			shader: 'wave-gentle-horizontal',
			bounds: { x: 0, y: 0, width: 10, height: 10 }
		});
		scheduler.triggerUpdate('canvas1');
		expect(notified).toHaveBeenCalledWith('canvas1');

		const img = document.createElement('img');
		scheduler.registerElement({
			id: 'img1',
			element: img,
			type: 'image',
			updateStrategy: 'static',
			shader: 'wave-gentle-horizontal',
			bounds: { x: 0, y: 0, width: 10, height: 10 }
		});
		scheduler.triggerRetry('img1');
		expect(notified).toHaveBeenCalledWith('img1');

		scheduler.destroy();
	});
});
