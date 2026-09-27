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

// Fluid-motion live handoff: pass `mediaVisualProvider()` to `fluidMotion({ providers })`.
export { mediaVisualProvider, liveMediaResources } from './live-media.js';
export type {
	MediaVisualProvider,
	MediaRepresentation,
	MediaRepresentationContext,
	MediaRetainedRenderer,
	MediaDecline,
	PlayerControl
} from './live-media.js';

// Utilities
export {
	detectVideo,
	extractVideosFromMarkdown,
	getPlatformConfig,
	getSupportedPlatforms
} from './video-detection.js';
