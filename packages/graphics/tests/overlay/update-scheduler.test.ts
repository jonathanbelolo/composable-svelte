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
function fakeVideo() {
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

	let nextId = 1;
	const pending = new Map<number, VideoFrameRequestCallback>();
	video.requestVideoFrameCallback = (cb) => {
		const id = nextId++;
		pending.set(id, cb);
		return id;
	};
	video.cancelVideoFrameCallback = (id) => void pending.delete(id);

	// jsdom reports `paused` as true and it is read-only.
	Object.defineProperty(video, 'paused', { value: false, configurable: true });

	return {
		element: video,
		net: (type: string) => listeners.get(type) ?? 0,
		/** Fire one video frame, as the browser would. */
		frame: () => {
			const batch = [...pending.entries()];
			pending.clear();
			batch.forEach(([, cb]) => cb(performance.now(), {} as VideoFrameCallbackMetadata));
		}
	};
}

const videoRegistration = (id: string, element: HTMLVideoElement): ElementRegistration => ({
	id,
	element,
	type: 'video',
	updateStrategy: 'frame',
	shader: 'wave-gentle-horizontal',
	bounds: { x: 0, y: 0, width: 10, height: 10 },
	needsUpdate: true
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
		const plain = document.createElement('video');
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