/**
 * The last two state-driven CSS transitions in this package, and the defect
 * they shared: **the resting state was invisible.**
 *
 * `ImagePreview` parked its `<img>` at `opacity: 0` and lifted it with a
 * `.loaded` class the client-side `load` handler adds. `VideoPlayer` parked its
 * controls at `opacity: 0` and lifted them with `.visible`. Both are prohibited
 * as CSS lifecycles, but the sharper problem is what they do where `$effect`
 * never runs: the server renders an invisible image, and a client with
 * JavaScript disabled never sees either. Motion One's `opacity: [0, 1]` supplies
 * its own start value, so the CSS resting state is now simply "visible".
 *
 * These are the first tests of either component's visibility.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ImagePreview from '../src/lib/streaming-chat/attachment-components/ImagePreview.svelte';
import VideoPlayer from '../src/lib/streaming-chat/attachment-components/VideoPlayer.svelte';
import type { MessageAttachment } from '../src/lib/streaming-chat/types.js';
import { TINY_VIDEO } from './__mocks__/tiny-video.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function render(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

const frames = (n: number) =>
	new Promise((resolve) => {
		let left = n;
		const tick = () => (left-- <= 0 ? resolve(undefined) : requestAnimationFrame(tick));
		requestAnimationFrame(tick);
	});

const opacity = (el: Element) => parseFloat(getComputedStyle(el).opacity);

/** A 1×1 transparent GIF — loads synchronously enough to fire `load`. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const image: MessageAttachment = {
	id: 'a1',
	filename: 'photo.png',
	url: PIXEL,
	mimeType: 'image/png',
	size: 42,
	type: 'image'
};

const video: MessageAttachment = {
	id: 'a2',
	filename: 'clip.webm',
	// Must decode: the controls live behind `{#if !error}`.
	url: TINY_VIDEO,
	mimeType: 'video/webm',
	size: 99,
	type: 'video'
};

describe('ImagePreview', () => {
	it('renders a visible image before anything has loaded', () => {
		// The no-JS and server-rendered case, as close as a browser test gets to
		// it: nothing in CSS may hide the image while it waits.
		const target = render(ImagePreview, {
			attachment: { ...image, url: 'https://example.invalid/never.png' }
		});
		const img = target.querySelector('img')!;

		expect(opacity(img), 'the image is parked invisible awaiting an effect').toBe(1);
	});

	it('fades in when it loads, and ends fully visible', async () => {
		const target = render(ImagePreview, { attachment: image });
		const img = target.querySelector('img')!;

		// Synthetic, and dispatched in this tick: a data URI's real `load` fires a
		// task later, so this always wins and the guard makes the real one a
		// no-op. Waiting for the real one would leave the sample below racing it.
		img.dispatchEvent(new Event('load'));
		flushSync();
		await frames(2);

		const mid = opacity(img);
		// Paired, so neither an instant appearance nor a stuck one passes.
		expect(mid, `mid-fade opacity was ${mid}`).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);

		await frames(20);
		expect(opacity(img)).toBe(1);
	});
});

describe('VideoPlayer controls', () => {
	function play(target: HTMLElement) {
		// `onplay` is what flips `isPlaying`, and `isPlaying` is what lets the
		// controls hide at all. No real playback needed.
		target.querySelector('video')!.dispatchEvent(new Event('play'));
		flushSync();
	}

	it('starts visible', () => {
		const target = render(VideoPlayer, { attachment: video });
		const controls = target.querySelector('.video-controls')!;

		expect(opacity(controls)).toBe(1);
	});

	it('fades out when the pointer leaves a playing video', async () => {
		const target = render(VideoPlayer, { attachment: video });
		const controls = target.querySelector('.video-controls')!;
		play(target);

		target.querySelector('.video-player')!.dispatchEvent(new MouseEvent('mouseleave'));
		flushSync();
		await frames(2);

		const mid = opacity(controls);
		// Paired: neither an instant hide nor no change at all passes.
		expect(mid, `mid-fade opacity was ${mid}`).toBeLessThan(1);
		expect(mid).toBeGreaterThan(0);
	});

	it('snaps back the moment the pointer returns', async () => {
		// Instant, and instant *through* the running fade — an inline style would
		// lose to it and the controls would vanish anyway.
		const target = render(VideoPlayer, { attachment: video });
		const controls = target.querySelector('.video-controls')!;
		const player = target.querySelector('.video-player')!;
		play(target);

		player.dispatchEvent(new MouseEvent('mouseleave'));
		flushSync();
		await frames(3);
		expect(opacity(controls), 'the fade-out never started').toBeLessThan(1);

		// `bubbles: true` matters: Svelte 5 delegates `mousemove` to a single root
		// listener, so a non-bubbling synthetic event never reaches the handler.
		// `mouseleave` above needs no flag — it never bubbles, so Svelte binds it
		// directly.
		player.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
		flushSync();
		await frames(4);

		expect(opacity(controls), 'the cancelled fade-out kept hiding them').toBe(1);
	});
});
