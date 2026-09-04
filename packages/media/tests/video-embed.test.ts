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

import type { VideoPlatform } from '../src/lib/video-embed/types.js';
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

/**
 * The type union must name exactly the platforms the registry can produce.
 *
 * The defect was a union of seven with a registry of three: `'tiktok'`,
 * `'dailymotion'`, `'twitter'` and `'generic'` typechecked everywhere and could
 * never be returned by any extractor. Re-adding one leaves every runtime
 * assertion in this file green — the only thing that catches it is a type-level
 * check, so here is one. `Exclude` in both directions, because a union that is
 * too *narrow* is a different bug with the same smell.
 */
type AssertNever<T extends never> = T;
type NoPhantomPlatforms = AssertNever<Exclude<VideoPlatform, 'youtube' | 'vimeo' | 'twitch'>>;
type NoMissingPlatforms = AssertNever<Exclude<'youtube' | 'vimeo' | 'twitch', VideoPlatform>>;
const _platformUnionIsExact: [NoPhantomPlatforms[], NoMissingPlatforms[]] = [[], []];

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
		// Kept, but note what it does *not* prove: `getSupportedPlatforms()` is
		// `Array.from(platforms.keys())` and `getPlatformConfig` is
		// `platforms.get`, so this asserts a Map returns values for its own keys —
		// true of every possible registry. The registry contents are pinned by the
		// `toEqual` above, and the *type union* by `NoPhantomPlatforms` below,
		// which is the half nothing checked.
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

describe('the component takes a url, which is what the docs always said', () => {
	// `<VideoEmbed url="…" />` is the call in the README, the props table and the
	// skill file. It did not work: `video` was the only required prop, and with
	// no rest-spread the `url` was silently dropped — so the documented example
	// rendered an error, not a video.
	it('detects the platform from a url', () => {
		const target = renderEmbed({ url: YOUTUBE });

		const iframe = target.querySelector('iframe');
		expect(iframe, 'nothing rendered from a url').not.toBeNull();
		expect(iframe!.getAttribute('src')).toContain('youtube.com/embed/dQw4w9WgXcQ');
	});

	it('still takes a pre-detected video', () => {
		// The other half: everything already written against this component passes
		// `video`, and must keep working.
		const target = renderEmbed({ video: detectVideo(YOUTUBE)! });
		expect(target.querySelector('iframe')!.getAttribute('src')).toContain('dQw4w9WgXcQ');
	});

	it('renders nothing for a url from no known platform', () => {
		// A page with one bad link should not be a page that fails to render.
		const target = renderEmbed({ url: 'https://example.com/not-a-video' });
		expect(target.querySelector('iframe')).toBeNull();
	});
});

describe('the documented props reach the iframe', () => {
	const src = (props: Record<string, unknown>) =>
		new URL(renderEmbed(props).querySelector('iframe')!.getAttribute('src')!);

	it('muted is applied, having been documented and inert', () => {
		// `muted` is in EmbedOptions and in every buildEmbedUrl, and the component
		// never applied it. It matters beyond preference: browsers refuse autoplay
		// with sound, so `autoplay` alone often does nothing.
		expect(src({ url: YOUTUBE, muted: true }).searchParams.get('mute')).toBe('1');
	});

	it('muted is off by default', () => {
		expect(src({ url: YOUTUBE }).searchParams.get('mute')).toBeNull();
	});

	it('spells muted the way each platform does', () => {
		// YouTube uses `mute`; Vimeo and Twitch use `muted`. Getting this wrong is
		// silent — an unknown parameter is ignored, not rejected.
		expect(src({ url: 'https://vimeo.com/76979871', muted: true }).searchParams.get('muted')).toBe(
			'1'
		);
	});

	it('aspectRatio overrides the platform default', () => {
		const target = renderEmbed({ url: YOUTUBE, aspectRatio: '1:1' });
		const container = target.querySelector('.video-embed__container') as HTMLElement;
		expect(container.style.paddingBottom).toBe('100%');
	});

	it('falls back to the platform default aspect ratio', () => {
		// Non-vacuity for the arm above: 16:9 is 56.25%, so the override is doing
		// something rather than both paths landing on one value.
		const target = renderEmbed({ url: YOUTUBE });
		const container = target.querySelector('.video-embed__container') as HTMLElement;
		expect(container.style.paddingBottom).toBe('56.25%');
	});
});

describe('the component supplies what only it can know', () => {
	it('sets Twitch parent from the page it is rendered on', () => {
		// Detection deliberately emits no `parent` — it cannot know the host. This
		// is the point where it becomes knowable, and the reason the SSR
		// `parent=localhost` defect is fixed rather than moved.
		const target = renderEmbed({ url: 'https://www.twitch.tv/videos/123456789' });
		const url = new URL(target.querySelector('iframe')!.getAttribute('src')!);

		expect(window.location.hostname).toBeTruthy();
		expect(url.searchParams.get('parent')).toBe(window.location.hostname);
	});

	it('leaves YouTube alone', () => {
		const url = new URL(
			renderEmbed({ url: YOUTUBE }).querySelector('iframe')!.getAttribute('src')!
		);
		expect(url.searchParams.get('parent')).toBeNull();
	});
});
