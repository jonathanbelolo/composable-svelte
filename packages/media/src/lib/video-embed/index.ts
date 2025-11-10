/**
 * Video Embed Module
 *
 * Provides video embedding functionality for external platforms.
 * Supports YouTube, Vimeo, Twitch, and other platforms.
 *
 * @example
 * ```svelte
 * <script>
 *   import { VideoEmbed, detectVideo } from '@composable-svelte/code/video-embed';
 *
 *   const video = detectVideo('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
 * </script>
 *
 * {#if video}
 *   <VideoEmbed {video} />
 * {/if}
 * ```
 */

// Component
export { default as VideoEmbed } from './VideoEmbed.svelte';

// Types
export type {
	VideoEmbed as VideoEmbedType,
	VideoPlatform,
	AspectRatio,
	PlatformConfig,
	EmbedOptions
} from './types.js';

// Utilities
export {
	detectVideo,
	extractVideosFromMarkdown,
	getPlatformConfig,
	getSupportedPlatforms
} from './video-detection.js';
