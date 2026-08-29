/**
 * Video Embed Types
 *
 * Type definitions for video embedding functionality.
 * Supports multiple video platforms (YouTube, Vimeo, Twitch, etc.)
 */

/**
 * Supported video platforms
 */
/**
 * The platforms this package can actually detect and embed.
 *
 * Exactly the keys of the registry in `video-detection.ts`. It previously also
 * named `twitter`, `tiktok`, `dailymotion` and `generic`, none of which had a
 * registry entry — so nothing could ever produce them, `getPlatformConfig`
 * returned `undefined` for all four while typechecking clean, and the README
 * advertised generic-URL support that does not exist.
 */
export type VideoPlatform = 'youtube' | 'vimeo' | 'twitch';

/**
 * Aspect ratio presets for video containers
 */
export type AspectRatio = '16:9' | '4:3' | '1:1' | '9:16';

/**
 * Which *kind* of thing a URL pointed at, where a platform embeds kinds
 * differently.
 *
 * Only Twitch distinguishes them today, and it does so drastically: a VOD is
 * `player.twitch.tv/?video=v123`, while a clip is a different host entirely —
 * `clips.twitch.tv/embed?clip=<slug>`. Detection knows which pattern matched, so
 * it records the answer rather than leaving `buildEmbedUrl` to guess from the
 * shape of an id.
 */
export type VideoKind = 'video' | 'clip';

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

	/**
	 * What the URL pointed at, when the platform embeds kinds differently.
	 * Twitch clips and VODs need different hosts and different parameters.
	 */
	kind?: VideoKind;

	/** Optional video title */
	title?: string;

	/** Aspect ratio (default: 16:9) */
	aspectRatio: AspectRatio;

	/** Platform-specific embed URL */
	embedUrl: string;

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

	/**
	 * The domain embedding the player, for platforms that require it.
	 *
	 * Twitch rejects an embed whose `parent` does not match the embedding page.
	 * It used to be read from `window.location.hostname` inside `buildEmbedUrl`,
	 * falling back to `'localhost'` — so a video detected on a server embedded
	 * with `parent=localhost` and was refused in production. Detection cannot
	 * know the host; only the thing doing the rendering can, so it passes it in.
	 */
	parent?: string;

	/** Which kind of media the id refers to. See {@link VideoKind}. */
	kind?: VideoKind;
}
