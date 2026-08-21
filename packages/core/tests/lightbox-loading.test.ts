/**
 * `lightbox.isImageLoading` was written in eleven places and read in none.
 *
 * Six actions set it true (`openLightbox`, both navigations, the two swipes,
 * `retryLoadImage`), three set it false, and no component ever looked at it. So
 * opening a lightbox on a full-size photo showed an empty black frame until the
 * image arrived, with nothing to say it was coming — the exact state the flag
 * existed to describe.
 *
 * `Spinner` already exists and is already used elsewhere in the package.
 *
 * The transition is what is asserted, not the presence of a spinner: a test that
 * only checks "spinner is there" passes against an implementation that never
 * takes it away, which would be a worse bug than the one being fixed.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { render } from 'vitest-browser-svelte';
import LightboxLoadingTest from './test-components/LightboxLoadingTest.svelte';

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mount() {
	const screen = render(LightboxLoadingTest);
	cleanup.push(() => screen.unmount());
	const root = screen.container;
	return {
		root,
		store: () => (window as never as Record<string, any>).__lightboxTestStore,
		spinner: () => root.querySelector('[role="status"][aria-label="Loading"]')
	};
}

describe('the lightbox loading indicator', () => {
	it('shows while the image is loading and goes away when it arrives', async () => {
		const lightbox = mount();

		// Synchronous: `load` cannot fire during mount, so this observes the real
		// pre-load state rather than a contrived one.
		expect(
			lightbox.spinner(),
			'nothing indicates the image is loading — isImageLoading has no reader'
		).not.toBeNull();

		await settle();

		expect(lightbox.store().state.lightbox.isImageLoading, 'the image did load').toBe(false);
		expect(lightbox.spinner(), 'the spinner outstayed the load').toBeNull();
	});

	it('comes back when navigation starts another load', async () => {
		const lightbox = mount();
		await settle();
		expect(lightbox.spinner()).toBeNull();

		lightbox.store().dispatch({ type: 'nextImage' });
		expect(lightbox.store().state.lightbox.isImageLoading, 'precondition').toBe(true);

		// `flushSync`, not a timer: the second image is a data URI and loads within
		// a task or two, so waiting would assert on the state *after* it arrived.
		flushSync();
		expect(lightbox.spinner(), 'navigating to another image shows no indicator').not.toBeNull();
	});

	it('is not shown alongside the error state', async () => {
		// The error branch replaces the image entirely and offers Retry; a spinner
		// on top of it would say the image is still coming when it is not.
		const lightbox = mount();
		await settle();

		lightbox.store().dispatch({ type: 'lightboxImageError', error: 'Failed to load image' });
		await settle();

		expect(lightbox.root.querySelector('[role="alert"]')).not.toBeNull();
		expect(lightbox.spinner()).toBeNull();
	});
});
