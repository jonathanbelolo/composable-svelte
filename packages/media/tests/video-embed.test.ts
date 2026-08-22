/**
 * `autoplay` is a public prop that did nothing, and the platform union promised
 * four platforms that cannot exist.
 *
 * `buildEmbedUrl(videoId, options?)` is implemented for all three supported
 * platforms, but both extractors call it with **no options** — so nothing in
 * `EmbedOptions` ever reached an embed URL, and the component's `autoplay` prop
 * was inert. The component said so itself in a comment and kept the prop anyway.
 *
 * `VideoPlatform` declared seven members while the extractor registry holds
 * three, so `twitter`, `tiktok`, `dailymotion` and `generic` could never be
 * produced by anything in this package. `getPlatformConfig` returned `undefined`
 * for all four while typechecking clean, and the README advertised generic-URL
 * support that does not exist.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import VideoEmbed from '../src/lib/video-embed/VideoEmbed.svelte';
import {
	detectVideo,
	getPlatformConfig,
	getSupportedPlatforms
} from '../src/lib/video-embed/video-detection.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

/** Mount the component and hand back its container, matching this package's other tests. */
function renderEmbed(props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(VideoEmbed as never, { target, props });
	flushSync();
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return target;
}

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('the autoplay prop', () => {
	// The defect is one level above the config. `buildEmbedUrl` has honoured
	// `EmbedOptions` all along — but both extractors call it with no options, so
	// the `embedUrl` the component receives is always the plain one, and the
	// component rendered that URL verbatim. Testing the config alone passes
	// against the broken component, which is what my first attempt did.

	it('is off by default', () => {
		const target = renderEmbed({ video: detectVideo(YOUTUBE)! });
		const src = target.querySelector('iframe')!.getAttribute('src')!;
		expect(src).not.toMatch(/autoplay=1/);
	});

	it('reaches the iframe when set', () => {
		const target = renderEmbed({ video: detectVideo(YOUTUBE)!, autoplay: true });
		const src = target.querySelector('iframe')!.getAttribute('src')!;

		expect(src, 'autoplay was set and the embed URL is unchanged').toMatch(/autoplay=1/);
	});

	it('still points at the right video', () => {
		// Rebuilding the URL must not lose the video it was for.
		const target = renderEmbed({ video: detectVideo(YOUTUBE)!, autoplay: true });
		expect(target.querySelector('iframe')!.getAttribute('src')).toContain('dQw4w9WgXcQ');
	});
});

describe('the platform union describes reality', () => {
	it('offers exactly the platforms that can be produced', () => {
		expect([...getSupportedPlatforms()].sort()).toEqual(['twitch', 'vimeo', 'youtube']);
	});

	it('has a config for every platform it names', () => {
		// The union used to name four platforms with no registry entry, so
		// `getPlatformConfig` returned undefined while typechecking clean.
		for (const platform of getSupportedPlatforms()) {
			expect(getPlatformConfig(platform), `${platform} has no config`).toBeDefined();
		}
	});

	it('still detects a real video', () => {
		// The control: narrowing the union must not narrow what works.
		const video = detectVideo(YOUTUBE);
		expect(video?.platform).toBe('youtube');
		expect(video?.videoId).toBe('dQw4w9WgXcQ');
	});
});
