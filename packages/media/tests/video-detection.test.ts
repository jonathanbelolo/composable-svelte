/**
 * URL → platform → embed URL, which is the whole of what this module does.
 *
 * Almost none of it was tested. `video-embed.test.ts` covers the component and
 * pins the platform union; the detection itself — the regexes, the id
 * extraction, the embed URLs each platform needs — had nothing, which is how
 * Twitch came to detect clips it could not embed.
 */

import { describe, it, expect } from 'vitest';
import {
	detectVideo,
	extractVideosFromMarkdown,
	getPlatformConfig,
	getSupportedPlatforms
} from '../src/lib/video-embed/video-detection';

const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const VIMEO = 'https://vimeo.com/76979871';

describe('the id extractor and the detector agree', () => {
	// `extractId` is public through `getPlatformConfig`, and used to hold its own
	// copy of every pattern — a second source of truth that nothing exercised.
	// It is now derived from `urlPatterns`, and this is the property that makes
	// that safe rather than merely tidier.
	it.each([
		['youtube', YOUTUBE, 'dQw4w9WgXcQ'],
		['youtube', 'https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['youtube', 'https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
		['vimeo', VIMEO, '76979871'],
		['vimeo', 'https://player.vimeo.com/video/76979871', '76979871'],
		['twitch', 'https://www.twitch.tv/videos/123456789', '123456789']
	] as const)('%s: %s', (platform, url, expectedId) => {
		const detected = detectVideo(url);
		// Non-vacuous first: `detectVideo` returns null for anything it does not
		// recognise, and `detected?.videoId` would then be `undefined` and
		// compare equal to nothing useful.
		expect(detected, `${url} was not detected at all`).not.toBeNull();
		expect(detected!.platform).toBe(platform);
		expect(detected!.videoId).toBe(expectedId);

		// The public extractor must say the same thing.
		expect(getPlatformConfig(platform)!.extractId(url)).toBe(expectedId);
	});

	it('both refuse a URL from no known platform', () => {
		expect(detectVideo('https://example.com/video/123')).toBeNull();
		for (const platform of getSupportedPlatforms()) {
			expect(getPlatformConfig(platform)!.extractId('https://example.com/video/123')).toBeNull();
		}
	});
});

describe('markdown extraction', () => {
	it('finds videos at all, so the ordering arm is not vacuous', () => {
		expect(extractVideosFromMarkdown(`See ${YOUTUBE}`).length).toBe(1);
	});

	it('finds several', () => {
		expect(extractVideosFromMarkdown(`${YOUTUBE} and ${VIMEO}`).length).toBe(2);
	});

	it('returns nothing for prose with no videos', () => {
		expect(extractVideosFromMarkdown('Just some words, and https://example.com/page')).toEqual([]);
	});

	it('returns them in the order they appear, not registry order', () => {
		// The defect: the loop is platforms-outer, so results came back grouped by
		// platform. Vimeo written first came back second, because YouTube is the
		// first entry in the registry. Anything rendering these in sequence showed
		// an order the author did not write.
		const markdown = `First ${VIMEO}, then ${YOUTUBE}.`;
		expect(extractVideosFromMarkdown(markdown).map((v) => v.platform)).toEqual([
			'vimeo',
			'youtube'
		]);
	});

	it('keeps order across three platforms', () => {
		// Two entries can be ordered correctly by luck; three cannot as easily,
		// and this puts the registry's first platform last.
		const twitch = 'https://www.twitch.tv/videos/123456789';
		const markdown = `${twitch} then ${VIMEO} then ${YOUTUBE}`;
		expect(extractVideosFromMarkdown(markdown).map((v) => v.platform)).toEqual([
			'twitch',
			'vimeo',
			'youtube'
		]);
	});

	it('reports a repeated video once per occurrence', () => {
		// Order-preservation must not turn into deduplication: the same video
		// linked twice is two embeds, and the positions differ.
		const markdown = `${YOUTUBE} and again ${YOUTUBE}`;
		expect(extractVideosFromMarkdown(markdown).length).toBe(2);
	});
});

describe('Twitch embeds the thing it detected', () => {
	const VOD = 'https://www.twitch.tv/videos/123456789';
	const CLIP = 'https://www.twitch.tv/somestreamer/clip/BraveHilariousOtterPeteZaroll';

	it('tells a VOD from a clip', () => {
		// Recorded from which pattern matched, not guessed from the shape of the
		// id — a clip slug that happened to be all digits would defeat that.
		expect(detectVideo(VOD)?.kind).toBe('video');
		expect(detectVideo(CLIP)?.kind).toBe('clip');
	});

	it('sends a clip to the clip host', () => {
		// The defect: a detected clip built `player.twitch.tv/?video=<slug>`.
		// Per Twitch's documentation `video` is for VODs and clips live at
		// clips.twitch.tv with a `clip` parameter, so the player never loaded.
		const clip = detectVideo(CLIP);
		expect(clip, 'the clip URL was not detected at all').not.toBeNull();

		const url = new URL(clip!.embedUrl);
		expect(url.host).toBe('clips.twitch.tv');
		expect(url.pathname).toBe('/embed');
		expect(url.searchParams.get('clip')).toBe('BraveHilariousOtterPeteZaroll');
		expect(url.searchParams.get('video')).toBeNull();
	});

	it('sends a VOD to the player host, with the documented v prefix', () => {
		// Twitch: "the video ID must have a `v` prefix", with the worked example
		// `?video=v40464143&parent=…`. The patterns capture bare digits.
		const vod = detectVideo(VOD);
		expect(vod).not.toBeNull();

		const url = new URL(vod!.embedUrl);
		expect(url.host).toBe('player.twitch.tv');
		expect(url.searchParams.get('video')).toBe('v123456789');
		expect(url.searchParams.get('clip')).toBeNull();
	});

	it('does not invent a parent at detection time', () => {
		// The SSR defect. `buildEmbedUrl` read `window.location.hostname` and fell
		// back to 'localhost', so a video detected on a server carried
		// `parent=localhost` into the browser and Twitch refused it. Detection
		// cannot know the embedding host; whatever renders supplies it.
		for (const url of [VOD, CLIP]) {
			expect(new URL(detectVideo(url)!.embedUrl).searchParams.get('parent')).toBeNull();
		}
	});

	it('uses a parent when one is given', () => {
		// Non-vacuity for the arm above: absence must mean "not defaulted",
		// not "cannot be set at all".
		const config = getPlatformConfig('twitch')!;
		const url = new URL(config.buildEmbedUrl('123', { parent: 'example.com' }));
		expect(url.searchParams.get('parent')).toBe('example.com');
	});

	it('is idempotent about the v prefix', () => {
		const config = getPlatformConfig('twitch')!;
		expect(new URL(config.buildEmbedUrl('v99')).searchParams.get('video')).toBe('v99');
		expect(new URL(config.buildEmbedUrl('99')).searchParams.get('video')).toBe('v99');
	});
});

describe('detection gives the same answer everywhere', () => {
	it('does not read the browser, so server and client agree', () => {
		// The property behind the parent fix: nothing in detection may depend on
		// ambient browser state, or the HTML a server renders differs from what
		// the client would have produced and hydration mismatches.
		//
		// Asserted in a real browser rather than by deleting `window` — this suite
		// runs in Chromium, where the global cannot be deleted, and where the
		// assertion is stronger anyway: a hostname *is* available, and detection
		// still must not reach for it.
		expect(window.location.hostname, 'no hostname to be tempted by').toBeTruthy();

		const embedUrl = detectVideo('https://www.twitch.tv/videos/1')?.embedUrl;
		expect(embedUrl).toBeTruthy();
		expect(embedUrl).not.toContain(window.location.hostname);
		expect(embedUrl).not.toContain('parent');
	});
});
