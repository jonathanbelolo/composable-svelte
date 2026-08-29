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
