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
import { TINY_VIDEO, OTHER_TINY_VIDEO } from './__mocks__/tiny-video.js';
import { propsBox } from './props-box.svelte.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Mount with a props object the test can mutate afterwards. */
function renderReactive(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(Component as never, { target, props: props as never });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

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

/** Poll rather than guess a frame count for something driven by a media event. */
async function waitFor<T>(read: () => T | null, what: string, tries = 60): Promise<T> {
	for (let i = 0; i < tries; i += 1) {
		flushSync();
		const found = read();
		if (found) return found;
		await new Promise((r) => setTimeout(r, 25));
	}
	throw new Error(`timed out waiting for ${what}`);
}

/**
 * Drive the element's running animation to `fraction` of its length and read the
 * opacity there.
 *
 * Deterministic on purpose. Sampling after a fixed number of frames races the
 * animation: measured through a real 0.2s fade, frame 2 lands at opacity 0.088,
 * so `> 0` has under a hundredth of margin and `< 1` breaks below ~15fps. Motion
 * One drives these through the Web Animations API, so the animation is
 * addressable and its clock can simply be moved.
 */
function opacityAt(el: Element, fraction: number): number {
	const [animation] = el.getAnimations();
	if (!animation) throw new Error('nothing is animating');
	const total = animation.effect!.getComputedTiming().activeDuration as number;
	animation.currentTime = total * fraction;
	return opacity(el);
}

/** A 1×1 transparent GIF — loads synchronously enough to fire `load`. */
const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
/** A different 1×1 GIF, so a swap is a genuinely different source. */
const OTHER_PIXEL =
	'data:image/gif;base64,R0lGODlhAQABAPAAAP8AAAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

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
		// it: nothing in CSS may hide the image while it waits. Read synchronously
		// on the mount tick — a data URI's `load` fires a task later, so nothing
		// has run yet, and no request leaves the machine.
		const target = render(ImagePreview, { attachment: image });
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
		await frames(1);

		const mid = opacityAt(img, 0.5);
		// Paired, so neither an instant appearance nor a stuck one passes.
		expect(mid, `mid-fade opacity was ${mid}`).toBeGreaterThan(0);
		expect(mid).toBeLessThan(1);

		await frames(20);
		expect(opacity(img)).toBe(1);
	});

	it('fades the incoming image on a swap, and never the outgoing one', async () => {
		// `isLoading` was set once at construction and never reset, so handing over
		// a new `attachment` left the component already "ready": the fade fired at
		// once on the element still painting the *previous* image — visible, blink
		// out, fade back in — and then never fired for the new one, which arrived
		// at full opacity with no entrance. `AttachmentPreviewModal` reuses one
		// instance rather than keying, so this is reachable.
		const props = propsBox({ attachment: image });
		const target = renderReactive(ImagePreview, props);
		const img = () => target.querySelector('img') as HTMLImageElement;

		img().dispatchEvent(new Event('load'));
		flushSync();
		await frames(20);
		expect(opacity(img())).toBe(1);

		props.attachment = { ...image, id: 'a3', url: OTHER_PIXEL };
		flushSync();

		// Synchronous, and the user-visible symptom. Without the reset the
		// component still believes it is loaded: no spinner, and the entrance
		// fires at once on the element still painting the previous image. Counting
		// animations a frame later cannot tell the two apart — by then the
		// incoming image has legitimately loaded and started its own fade, which
		// is what an earlier draft of this test mistook for the bug.
		expect(
			target.querySelector('.image-loading'),
			'the swap was not treated as a new load'
		).not.toBeNull();
		expect(img().getAnimations(), 'faded the outgoing image').toHaveLength(0);
		expect(opacity(img()), 'blinked the outgoing image out').toBe(1);

		// And the incoming one does get its entrance, on its own load.
		await frames(2);
		expect(img().getAnimations(), 'the incoming image never faded in').toHaveLength(1);

		await frames(25);
		expect(opacity(img())).toBe(1);
	});

	it('does not re-fade when the same image is handed over again', async () => {
		// A parent that rebuilds its attachment object each render passes a new
		// prop carrying the same URL. That re-runs the effect, and without the
		// `fadedInFor` guard it re-runs the entrance on an image the reader is
		// already looking at — a flicker, not an entrance.
		const props = propsBox({ attachment: image });
		const target = renderReactive(ImagePreview, props);
		const img = () => target.querySelector('img') as HTMLImageElement;

		img().dispatchEvent(new Event('load'));
		flushSync();
		await frames(20);
		expect(opacity(img())).toBe(1);

		props.attachment = { ...image };
		flushSync();
		await frames(1);

		expect(img().getAnimations(), 'the same image faded again').toHaveLength(0);
		expect(opacity(img())).toBe(1);
	});

	it('fades an image returned to after a swap it never finished', async () => {
		// A → B → A while B is still loading. `fadedInFor` still holds A from the
		// first time, so without the reset clearing it the effect decides A has
		// already had its entrance and skips — the one sequence in which that
		// clear is observable. Scrubbing a gallery does exactly this.
		const props = propsBox({ attachment: image });
		const target = renderReactive(ImagePreview, props);
		const img = () => target.querySelector('img') as HTMLImageElement;

		img().dispatchEvent(new Event('load'));
		flushSync();
		await frames(20);

		// B, and never let it load — `flushSync` does not yield to the task queue,
		// so no load event can fire between here and the swap back. No stalling
		// source needed, and so no request leaves the machine.
		props.attachment = { ...image, id: 'b', url: OTHER_PIXEL };
		flushSync();

		props.attachment = { ...image };
		flushSync();
		img().dispatchEvent(new Event('load'));
		flushSync();
		await frames(2);

		expect(img().getAnimations(), 'the returning image skipped its entrance').toHaveLength(1);
	});

	it('does not leave an enabled, empty fullscreen button behind the error card', () => {
		// Hiding the `<img>` left its wrapper — a real `<button>` with an
		// aria-label — enabled, focusable and 16×6px, sitting beside the ⚠️ card.
		// Activating it opened fullscreen on the error message.
		const target = render(ImagePreview, { attachment: image });
		target.querySelector('img')!.dispatchEvent(new Event('error'));
		flushSync();

		const zoom = target.querySelector('.image-preview__zoom') as HTMLButtonElement;
		expect(zoom.disabled).toBe(true);
	});

	it('does not describe the previous image while the next one loads', async () => {
		// The header reads `naturalWidth`/`naturalHeight`, which the source-change
		// reset did not clear.
		const props = propsBox({ attachment: image });
		const target = renderReactive(ImagePreview, props);
		const img = () => target.querySelector('img') as HTMLImageElement;

		img().dispatchEvent(new Event('load'));
		flushSync();
		await frames(2);
		const first = target.textContent ?? '';

		props.attachment = { ...image, id: 'a4', url: OTHER_PIXEL, filename: 'other.png' };
		flushSync();

		// Whatever dimensions the first image reported, the header must not still
		// be claiming them for a source that has not loaded.
		const dimensions = target.querySelector('.image-dimensions');
		expect(dimensions, `header still reads "${first}"`).toBeNull();
	});

	it('hides the broken-image placeholder when the source fails', () => {
		// With the fade moved to Motion One the resting opacity is 1, so the
		// browser's own broken-image box would paint straight over the error card.
		const target = render(ImagePreview, { attachment: image });
		target.querySelector('img')!.dispatchEvent(new Event('error'));
		flushSync();

		expect(target.querySelector('.image-error'), 'no error card').not.toBeNull();
		expect(target.querySelector('img'), 'the failed image is still painted').toBeNull();
	});
});

describe('VideoPlayer controls', () => {
	function play(target: HTMLElement) {
		// `onplay` is what flips `isPlaying`, and `isPlaying` is what lets the
		// controls hide at all. No real playback needed.
		target.querySelector('video')!.dispatchEvent(new Event('play'));
		flushSync();
	}

	it('starts visible, from CSS alone', () => {
		const target = render(VideoPlayer, { attachment: video });
		const controls = target.querySelector('.video-controls') as HTMLElement;

		expect(opacity(controls)).toBe(1);
		// The second half is what the effect's first-run early return is *for*: an
		// opening inline `opacity: 1` would paper over a regression back to
		// `opacity: 0` in the stylesheet, and the assertion above would keep
		// passing while server-rendered controls went invisible again.
		expect(controls.style.opacity, 'the first run wrote an inline opacity').toBe('');
	});

	it('fades out when the pointer leaves a playing video', async () => {
		const target = render(VideoPlayer, { attachment: video });
		const controls = target.querySelector('.video-controls')!;
		play(target);

		target.querySelector('.video-player')!.dispatchEvent(new MouseEvent('mouseleave'));
		flushSync();
		await frames(1);

		const mid = opacityAt(controls, 0.5);
		// Paired: neither an instant hide nor no change at all passes.
		expect(mid, `mid-fade opacity was ${mid}`).toBeLessThan(1);
		expect(mid).toBeGreaterThan(0);
	});

	it('recovers when handed a working video after a failed one', async () => {
		// `error` gates the whole control bar and the play overlay, and nothing
		// cleared it. `AttachmentPreviewModal` renders `<VideoPlayer {attachment} />`
		// unkeyed, so a second, perfectly good video rendered as a permanently
		// broken player. The identical defect in `ImagePreview` was fixed and this
		// one was missed.
		const props = propsBox({ attachment: { ...video, url: 'data:video/webm;base64,AAAA' } });
		const target = renderReactive(VideoPlayer, props);

		await waitFor(() => target.querySelector('.video-error'), 'the bad source to fail');
		expect(target.querySelector('.video-controls'), 'controls survived a failure').toBeNull();

		props.attachment = { ...video };
		flushSync();

		expect(target.querySelector('.video-error'), 'the error card outlived its source').toBeNull();
		expect(target.querySelector('.video-controls'), 'the controls never came back').not.toBeNull();
	});

	it('rebuilds controls that can actually be clicked', async () => {
		// The subtle half. `showControls` drives the `.visible` class, and that
		// class is the only thing restoring `pointer-events`. Rebuild the bar with
		// `showControls` still `false` from before the failure and it comes back
		// at its resting CSS opacity — fully visible — and inert. That reads as a
		// broken player, not a hidden one, which is why opacity alone cannot tell
		// this apart.
		const props = propsBox({ attachment: { ...video } });
		const target = renderReactive(VideoPlayer, props);
		const element = target.querySelector('video') as HTMLVideoElement;

		// Play, then let the pointer leave: the controls fade out and
		// `showControls` goes false.
		element.dispatchEvent(new Event('play'));
		flushSync();
		target.querySelector('.video-player')!.dispatchEvent(new MouseEvent('mouseleave'));
		flushSync();

		// Now fail the source and hand over a working one.
		element.dispatchEvent(new Event('error'));
		flushSync();
		props.attachment = { ...video, id: 'v2', url: OTHER_TINY_VIDEO };
		flushSync();

		const controls = target.querySelector('.video-controls') as HTMLElement;
		expect(controls, 'the controls never came back').not.toBeNull();
		expect(getComputedStyle(controls).pointerEvents, 'the rebuilt controls are inert').not.toBe(
			'none'
		);
	});

	it('says so when playback will not start', async () => {
		// A rejected `play()` used to latch the fatal error and remove the player
		// for good. Logging it instead traded a permanent dead-end for an
		// invisible one — a click that does nothing at all.
		const target = render(VideoPlayer, { attachment: video });
		const element = target.querySelector('video') as HTMLVideoElement;
		element.play = () => Promise.reject(new DOMException('no', 'NotAllowedError'));

		// The overlay only appears once metadata has loaded.
		const overlay = await waitFor(
			() => target.querySelector('.video-play-overlay') as HTMLButtonElement | null,
			'the play overlay'
		);
		overlay.click();
		await waitFor(() => target.querySelector('.video-playback-notice'), 'a complaint');

		// And it is transient: a play that works clears it.
		element.dispatchEvent(new Event('play'));
		flushSync();
		expect(target.querySelector('.video-playback-notice')).toBeNull();
		// Not the fatal path — the player is still usable.
		expect(target.querySelector('.video-error')).toBeNull();
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
