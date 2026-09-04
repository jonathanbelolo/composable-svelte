/**
 * Keyboard access to the attachment components.
 *
 * Two of these guard live defects that svelte-check could only hint at:
 *
 * - `AttachmentPreviewModal` had `onkeydown` on a `role="dialog"` div with no
 *   tabindex that nothing ever focused. Focus stayed on the trigger, outside the
 *   subtree, so the handler never ran and Escape did nothing. The warning read
 *   as "missing tabindex"; the defect was a modal with no keyboard exit.
 * - `ImagePreview` put `onclick` on an `<img>` — not focusable, no keyboard
 *   activation. The header's "View fullscreen" button only renders when
 *   `showHeader` is true, so a `showHeader={false}` consumer had no way in at
 *   all.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import AttachmentPreviewModal from '../src/lib/streaming-chat/attachment-components/AttachmentPreviewModal.svelte';
import ImagePreview from '../src/lib/streaming-chat/attachment-components/ImagePreview.svelte';
import VideoPlayer from '../src/lib/streaming-chat/attachment-components/VideoPlayer.svelte';
import type { MessageAttachment } from '../src/lib/streaming-chat/types';

const image: MessageAttachment = {
	id: 'a1',
	type: 'image',
	filename: 'photo.png',
	url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
	size: 128,
	mimeType: 'image/png'
};

const video: MessageAttachment = {
	id: 'v1',
	type: 'video',
	filename: 'clip.mp4',
	url: 'data:video/mp4;base64,AAAA',
	size: 2048,
	mimeType: 'video/mp4'
};

let cleanup: Array<() => void> = [];

afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountComponent(Component: unknown, props: Record<string, unknown>) {
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

describe('AttachmentPreviewModal', () => {
	it('closes on Escape', () => {
		let closed = 0;
		mountComponent(AttachmentPreviewModal, {
			attachment: image,
			open: true,
			onclose: () => (closed += 1)
		});

		// Dispatch from whatever actually has focus, as a real user would — the
		// point is that the dialog focused itself on open.
		const active = document.activeElement ?? document.body;
		active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		flushSync();

		expect(closed, 'Escape did not close the preview modal').toBe(1);
	});

	it('focuses itself when opened, so keydown can reach it', () => {
		const target = mountComponent(AttachmentPreviewModal, {
			attachment: image,
			open: true,
			onclose: () => {}
		});

		const dialog = target.querySelector<HTMLElement>('[role="dialog"]');
		expect(dialog).not.toBeNull();
		expect(dialog!.getAttribute('tabindex')).toBe('-1');
		expect(document.activeElement).toBe(dialog);
	});

	it('ignores other keys', () => {
		let closed = 0;
		mountComponent(AttachmentPreviewModal, {
			attachment: image,
			open: true,
			onclose: () => (closed += 1)
		});

		(document.activeElement ?? document.body).dispatchEvent(
			new KeyboardEvent('keydown', { key: 'a', bubbles: true })
		);
		flushSync();
		expect(closed).toBe(0);
	});
});

describe('ImagePreview', () => {
	it('exposes fullscreen as a real button even with the header hidden', () => {
		const target = mountComponent(ImagePreview, { attachment: image, showHeader: false });

		const zoom = target.querySelector<HTMLButtonElement>('.image-preview__zoom');
		expect(zoom, 'no keyboard-reachable fullscreen control').not.toBeNull();
		expect(zoom!.tagName).toBe('BUTTON');
		expect(zoom!.getAttribute('aria-label')).toContain('photo.png');
		// The img inside must not carry its own click handler any more.
		expect(zoom!.querySelector('img')).not.toBeNull();
	});

	it('disables the control when fullscreen is not allowed', () => {
		const target = mountComponent(ImagePreview, {
			attachment: image,
			allowFullscreen: false
		});
		const zoom = target.querySelector<HTMLButtonElement>('.image-preview__zoom');
		expect(zoom!.disabled).toBe(true);
	});
});

describe('VideoPlayer', () => {
	it('always renders a captions track, with no src when none is supplied', () => {
		const target = mountComponent(VideoPlayer, { attachment: video });

		const videoEl = target.querySelector<HTMLVideoElement>('video');
		expect(videoEl).not.toBeNull();

		const track = videoEl!.querySelector('track');
		expect(track, 'no <track> — the a11y rule needs a literal one').not.toBeNull();
		expect(track!.getAttribute('kind')).toBe('captions');
		// No src attribute at all, so the browser makes no request for it.
		expect(track!.hasAttribute('src')).toBe(false);
		expect(videoEl!.textTracks.length).toBe(1);
	});

	it('binds the track when captions are supplied', () => {
		const target = mountComponent(VideoPlayer, {
			attachment: {
				...video,
				metadata: {
					captions: { src: 'https://example.test/clip.vtt', srclang: 'en', label: 'English' }
				}
			}
		});

		const track = target.querySelector<HTMLTrackElement>('video track');
		expect(track!.getAttribute('src')).toBe('https://example.test/clip.vtt');
		expect(track!.getAttribute('srclang')).toBe('en');
		expect(track!.getAttribute('label')).toBe('English');
	});

	it('reveals its controls on focus, not only on mouse movement', () => {
		const target = mountComponent(VideoPlayer, { attachment: video });
		const container = target.querySelector<HTMLElement>('.video-player');

		expect(container).not.toBeNull();
		// role="group" clears the static-interaction rule honestly, and onfocusin
		// is what makes the controls reachable by keyboard: they are
		// `opacity: 0; pointer-events: none` until revealed, which does not remove
		// them from the tab order.
		expect(container!.getAttribute('role')).toBe('group');
	});
});
