/**
 * Video Platform Detection Utilities
 *
 * Detects video platforms from URLs and generates embed URLs.
 * Supports YouTube, Vimeo, Twitch, and other platforms.
 */

import type {
	VideoEmbed,
	VideoPlatform,
	PlatformConfig,
	EmbedOptions,
	VideoKind
} from './types.js';

/**
 * A registry entry before `extractId` is filled in.
 *
 * Every platform used to declare its patterns twice — once as `urlPatterns` and
 * once again inside its own `extractId`, which nothing in this module ever
 * called. Two copies of a regex is one copy too many: a pattern fixed in one
 * place leaves the other quietly stale, and `extractId` is public through
 * `getPlatformConfig`, so the stale copy is the one a consumer would have got.
 */
type PlatformDefinition = Omit<PlatformConfig, 'extractId' | 'urlPatterns'> & {
	patterns: PlatformPattern[];
};

/**
 * A detection pattern, and what matching it means.
 *
 * Twitch is why `kind` exists: the same platform embeds a VOD and a clip
 * through different hosts, and only the pattern that matched knows which one a
 * URL was. Discriminating on the *shape of the extracted id* would work until a
 * clip slug happened to be all digits.
 */
interface PlatformPattern {
	pattern: RegExp;
	kind?: VideoKind;
}

/** The registry entry, which is a `PlatformConfig` plus the richer patterns. */
interface InternalPlatform extends PlatformConfig {
	patterns: PlatformPattern[];
}

/**
 * Run a platform's patterns and return the first captured id.
 *
 * The single implementation of what each `extractId` spelled out by hand, and
 * the same walk `detectVideo` does — so the public helper and the internal
 * detection can no longer disagree about what a URL means.
 */
function extractIdWith(urlPatterns: RegExp[]): (url: string) => string | null {
	return (url: string) => {
		for (const pattern of urlPatterns) {
			const match = url.match(pattern);
			if (match && match[1]) return match[1];
		}
		return null;
	};
}

const definePlatform = (definition: PlatformDefinition): InternalPlatform => {
	// `urlPatterns` stays on the public config, derived, so consumers reading it
	// through `getPlatformConfig` see no change.
	const urlPatterns = definition.patterns.map((entry) => entry.pattern);
	return { ...definition, urlPatterns, extractId: extractIdWith(urlPatterns) };
};

/**
 * Platform registry with detection patterns and embed URL builders
 */
const platforms = new Map<VideoPlatform, InternalPlatform>([
	[
		'youtube',
		definePlatform({
			name: 'YouTube',
			patterns: [
				{ pattern: /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/ },
				{ pattern: /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/ },
				{ pattern: /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/ },
				{ pattern: /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/ }
			],
			buildEmbedUrl: (videoId: string, options?: EmbedOptions): string => {
				const params = new URLSearchParams();

				if (options?.autoplay) {
					params.set('autoplay', '1');
				}

				if (options?.muted) {
					params.set('mute', '1');
				}

				if (options?.startTime) {
					params.set('start', options.startTime.toString());
				}

				if (options?.loop) {
					params.set('loop', '1');
					params.set('playlist', videoId);
				}

				const queryString = params.toString();
				return `https://www.youtube.com/embed/${videoId}${queryString ? `?${queryString}` : ''}`;
			},
			defaultAspectRatio: '16:9'
		})
	],
	[
		'vimeo',
		definePlatform({
			name: 'Vimeo',
			patterns: [
				{ pattern: /(?:vimeo\.com\/)(\d+)/ },
				{ pattern: /(?:player\.vimeo\.com\/video\/)(\d+)/ }
			],
			buildEmbedUrl: (videoId: string, options?: EmbedOptions): string => {
				const params = new URLSearchParams();

				if (options?.autoplay) {
					params.set('autoplay', '1');
				}

				if (options?.muted) {
					params.set('muted', '1');
				}

				if (options?.loop) {
					params.set('loop', '1');
				}

				const queryString = params.toString();
				return `https://player.vimeo.com/video/${videoId}${queryString ? `?${queryString}` : ''}`;
			},
			defaultAspectRatio: '16:9'
		})
	],
	[
		'twitch',
		definePlatform({
			name: 'Twitch',
			patterns: [
				{ pattern: /(?:twitch\.tv\/videos\/)(\d+)/, kind: 'video' },
				{ pattern: /(?:twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/, kind: 'clip' }
			],
			buildEmbedUrl: (videoId: string, options?: EmbedOptions): string => {
				const params = new URLSearchParams();

				// `parent` is required by Twitch and must match the embedding page.
				// It is *not* defaulted here: this function used to read
				// `window.location.hostname` and fall back to `'localhost'`, so a
				// video detected during server rendering embedded with
				// `parent=localhost` and was refused in production. Detection cannot
				// know the host. `<VideoEmbed>` supplies it at render time; a caller
				// building URLs directly passes `options.parent`.
				if (options?.parent) {
					params.set('parent', options.parent);
				}

				if (options?.autoplay) {
					params.set('autoplay', 'true');
				}

				if (options?.muted) {
					params.set('muted', 'true');
				}

				if (options?.kind === 'clip') {
					// A clip is a different host and a different parameter, not a
					// different id in the same URL. Building
					// `player.twitch.tv/?video=<slug>` — which is what this did —
					// produces a player that never loads: `video` is for VODs, and
					// clips live at `clips.twitch.tv/embed`.
					params.set('clip', videoId);
					return `https://clips.twitch.tv/embed?${params.toString()}`;
				}

				// Twitch documents the VOD id as carrying a `v` prefix, and its own
				// worked example is `?video=v40464143&parent=…`. The patterns above
				// capture bare digits from `twitch.tv/videos/123`, so it is added
				// here — idempotently, in case a caller passes an id that has it.
				params.set('video', `v${videoId.replace(/^v/, '')}`);

				if (options?.startTime) {
					params.set('time', `${options.startTime}s`);
				}

				return `https://player.twitch.tv/?${params.toString()}`;
			},
			defaultAspectRatio: '16:9'
		})
	]
]);

/**
 * Detect video platform from a single URL and extract metadata.
 *
 * @param url - URL to check
 * @returns VideoEmbed if URL matches a known platform, null otherwise
 */
export function detectVideo(url: string): VideoEmbed | null {
	for (const [platform, config] of platforms) {
		for (const { pattern, kind } of config.patterns) {
			const match = url.match(pattern);
			if (match && match[1]) {
				const videoId = match[1];
				return {
					url,
					platform,
					videoId,
					...(kind ? { kind } : {}),
					aspectRatio: config.defaultAspectRatio,
					// No `parent` — see the Twitch builder. The URL is completed by
					// whatever renders it, which is the only thing that knows the host.
					embedUrl: config.buildEmbedUrl(videoId, kind ? { kind } : undefined)
				};
			}
		}
	}

	return null;
}

/**
 * Extract all video URLs from markdown content.
 *
 * Uses platform-specific patterns to avoid conflicts with image URL detection.
 * Only detects URLs that match known video platform patterns.
 *
 * @param markdown - Markdown content to parse
 * @returns Array of detected video embeds
 */
export function extractVideosFromMarkdown(markdown: string): VideoEmbed[] {
	// Every match is collected with where it was found, then sorted, because the
	// loop below is necessarily platforms-outer — the patterns are per-platform —
	// and returning in that order returns the registry's order, not the
	// document's. A page with a Vimeo link above a YouTube link produced
	// `[youtube, vimeo]`, so anything rendering these in sequence showed them in
	// an order the author did not write.
	const found: Array<{ at: number; video: VideoEmbed }> = [];

	// Use platform-specific patterns directly to avoid matching image URLs
	for (const [platform, config] of platforms) {
		for (const { pattern, kind } of config.patterns) {
			// Use matchAll to find all occurrences globally
			const matches = markdown.matchAll(new RegExp(pattern.source, 'g'));

			for (const match of matches) {
				if (!match[1] || match.index === undefined) continue;

				const videoId = match[1];
				found.push({
					at: match.index,
					video: {
						url: match[0],
						platform,
						videoId,
						...(kind ? { kind } : {}),
						aspectRatio: config.defaultAspectRatio,
						embedUrl: config.buildEmbedUrl(videoId, kind ? { kind } : undefined)
					}
				});
			}
		}
	}

	return found.sort((a, b) => a.at - b.at).map((entry) => entry.video);
}

/**
 * Get platform configuration by name.
 *
 * @param platform - Platform name
 * @returns Platform configuration or undefined
 */
export function getPlatformConfig(platform: VideoPlatform): PlatformConfig | undefined {
	return platforms.get(platform);
}

/**
 * Get all supported platforms.
 *
 * @returns Array of supported platform names
 */
export function getSupportedPlatforms(): VideoPlatform[] {
	return Array.from(platforms.keys());
}
