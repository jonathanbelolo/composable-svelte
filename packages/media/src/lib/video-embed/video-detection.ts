/**
 * Video Platform Detection Utilities
 *
 * Detects video platforms from URLs and generates embed URLs.
 * Supports YouTube, Vimeo, Twitch, and other platforms.
 */

import type { VideoEmbed, VideoPlatform, PlatformConfig, EmbedOptions } from './types.js';

/**
 * Platform registry with detection patterns and embed URL builders
 */
const platforms = new Map<VideoPlatform, PlatformConfig>([
	[
		'youtube',
		{
			name: 'YouTube',
			urlPatterns: [
				/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
				/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
				/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
				/(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
			],
			extractId: (url: string): string | null => {
				const patterns = [
					/(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
					/(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
					/(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
					/(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
				];

				for (const pattern of patterns) {
					const match = url.match(pattern);
					if (match && match[1]) {
						return match[1];
					}
				}

				return null;
			},
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
		}
	],
	[
		'vimeo',
		{
			name: 'Vimeo',
			urlPatterns: [/(?:vimeo\.com\/)(\d+)/, /(?:player\.vimeo\.com\/video\/)(\d+)/],
			extractId: (url: string): string | null => {
				const patterns = [/(?:vimeo\.com\/)(\d+)/, /(?:player\.vimeo\.com\/video\/)(\d+)/];

				for (const pattern of patterns) {
					const match = url.match(pattern);
					if (match && match[1]) {
						return match[1];
					}
				}

				return null;
			},
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
		}
	],
	[
		'twitch',
		{
			name: 'Twitch',
			urlPatterns: [/(?:twitch\.tv\/videos\/)(\d+)/, /(?:twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/],
			extractId: (url: string): string | null => {
				const patterns = [
					/(?:twitch\.tv\/videos\/)(\d+)/,
					/(?:twitch\.tv\/\w+\/clip\/)([a-zA-Z0-9_-]+)/
				];

				for (const pattern of patterns) {
					const match = url.match(pattern);
					if (match && match[1]) {
						return match[1];
					}
				}

				return null;
			},
			buildEmbedUrl: (videoId: string, options?: EmbedOptions): string => {
				// Twitch requires parent parameter for embed security
				// Get current domain dynamically (SSR-safe)
				const domain =
					typeof window !== 'undefined' ? window.location.hostname : 'localhost';

				const params = new URLSearchParams({
					video: videoId,
					parent: domain
				});

				if (options?.autoplay) {
					params.set('autoplay', 'true');
				}

				if (options?.muted) {
					params.set('muted', 'true');
				}

				if (options?.startTime) {
					params.set('time', `${options.startTime}s`);
				}

				return `https://player.twitch.tv/?${params.toString()}`;
			},
			defaultAspectRatio: '16:9'
		}
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
		for (const pattern of config.urlPatterns) {
			const match = url.match(pattern);
			if (match && match[1]) {
				const videoId = match[1];
				return {
					url,
					platform,
					videoId,
					aspectRatio: config.defaultAspectRatio,
					embedUrl: config.buildEmbedUrl(videoId)
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
	const videos: VideoEmbed[] = [];

	// Use platform-specific patterns directly to avoid matching image URLs
	for (const [platform, config] of platforms) {
		for (const pattern of config.urlPatterns) {
			// Use matchAll to find all occurrences globally
			const matches = markdown.matchAll(new RegExp(pattern.source, 'g'));

			for (const match of matches) {
				if (match[1]) {
					const videoId = match[1];
					videos.push({
						url: match[0],
						platform,
						videoId,
						aspectRatio: config.defaultAspectRatio,
						embedUrl: config.buildEmbedUrl(videoId)
					});
				}
			}
		}
	}

	return videos;
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
