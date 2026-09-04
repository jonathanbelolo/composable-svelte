/**
 * Video Embed Module
 *
 * Provides video embedding for YouTube, Vimeo and Twitch.
 *
 * @example
 * ```svelte
 * <script>
 *   import { VideoEmbed } from '@composable-svelte/media/video-embed';
 * </script>
 *
 * <VideoEmbed url="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />
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
