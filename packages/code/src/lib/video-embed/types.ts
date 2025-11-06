/**
 * Video Embed Types
 *
 * Type definitions for video embedding functionality.
 * Supports multiple video platforms (YouTube, Vimeo, Twitch, etc.)
 */

/**
 * Supported video platforms
 */
export type VideoPlatform =
	| 'youtube'
	| 'vimeo'
	| 'twitch'
	| 'twitter'
	| 'tiktok'
	| 'dailymotion'
	| 'generic';

/**
 * Aspect ratio presets for video containers
 */
export type AspectRatio = '16:9' | '4:3' | '1:1' | '9:16';

/**
 * Video embed data extracted from URLs
 */
export interface VideoEmbed {
	/** Original URL from markdown */
	url: string;

	/** Detected platform */
	platform: VideoPlatform;

	/** Extracted video ID */
	videoId: string;

	/** Optional video title */
	title?: string;

	/** Aspect ratio (default: 16:9) */
	aspectRatio: AspectRatio;

	/** Platform-specific embed URL */
	embedUrl: string;

	/** Optional start time in seconds */
	startTime?: number;
}

/**
 * Platform configuration for URL detection and embed generation
 */
export interface PlatformConfig {
	/** Platform display name */
	name: string;

	/** URL patterns to match (with video ID capture group) */
	urlPatterns: RegExp[];

	/** Extract video ID from URL */
	extractId: (url: string) => string | null;

	/** Build embed URL from video ID */
	buildEmbedUrl: (videoId: string, options?: EmbedOptions) => string;

	/** Default aspect ratio for this platform */
	defaultAspectRatio: AspectRatio;
}

/**
 * Options for embedding videos
 */
export interface EmbedOptions {
	/** Enable autoplay (usually blocked by browsers) */
	autoplay?: boolean;

	/** Mute audio */
	muted?: boolean;

	/** Start time in seconds */
	startTime?: number;

	/** Loop playback */
	loop?: boolean;
}
