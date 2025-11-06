<script lang="ts">
	import type { VideoEmbed as VideoEmbedType } from './types.js';

	/**
	 * VideoEmbed Component
	 *
	 * Pure presentational component for embedding videos from external platforms.
	 * Supports YouTube, Vimeo, Twitch, and other platforms.
	 *
	 * Features:
	 * - Responsive iframe with aspect ratio preservation
	 * - Lazy loading for performance
	 * - Full accessibility support (ARIA, keyboard nav)
	 * - Security: sandbox attributes, referrer policy
	 */

	interface Props {
		/** Video embed data (required) */
		video: VideoEmbedType;

		/** Custom CSS class */
		class?: string;

		/** Enable autoplay (default: false, usually blocked by browsers) */
		autoplay?: boolean;

		/** Show video title above embed (default: false) */
		showTitle?: boolean;
	}

	const props = $props<Props>();

	// Get aspect ratio padding-bottom percentage
	const aspectRatioPadding = $derived(() => {
		switch (props.video.aspectRatio) {
			case '16:9':
				return '56.25%'; // 9/16 * 100
			case '4:3':
				return '75%'; // 3/4 * 100
			case '1:1':
				return '100%';
			case '9:16':
				return '177.78%'; // 16/9 * 100
			default:
				return '56.25%'; // Default to 16:9
		}
	});

	// Build iframe allow attribute
	const iframeAllow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

	// Get platform display name
	const platformName = $derived(() => {
		const names: Record<string, string> = {
			youtube: 'YouTube',
			vimeo: 'Vimeo',
			twitch: 'Twitch',
			twitter: 'Twitter',
			tiktok: 'TikTok',
			dailymotion: 'Dailymotion',
			generic: 'Video'
		};
		return names[props.video.platform] || 'Video';
	});
</script>

<div class="video-embed {props.class ?? ''}" role="region" aria-label="Embedded video">
	{#if props.showTitle && props.video.title}
		<div class="video-embed__title">
			{props.video.title}
		</div>
	{/if}

	<div class="video-embed__container" style="padding-bottom: {aspectRatioPadding()};">
		<iframe
			src={props.video.embedUrl}
			title={props.video.title || `${platformName()} video player`}
			class="video-embed__iframe"
			frameborder="0"
			allow={iframeAllow}
			allowfullscreen
			loading="lazy"
			sandbox="allow-scripts allow-same-origin allow-presentation"
			referrerpolicy="no-referrer"
			aria-label={`${platformName()} video player`}
		/>
	</div>
</div>

<style>
	.video-embed {
		position: relative;
		width: 100%;
		max-width: 800px;
		margin: 16px 0;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.video-embed__title {
		padding: 8px 12px;
		background: #f5f5f5;
		font-size: 14px;
		font-weight: 500;
		color: #333;
	}

	.video-embed__container {
		position: relative;
		width: 100%;
		height: 0;
		/* Padding-bottom set via inline style for aspect ratio */
	}

	.video-embed__iframe {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		border: none;
	}

	/* Focus visible for accessibility */
	.video-embed:focus-within {
		outline: 2px solid #007aff;
		outline-offset: 2px;
	}

	/* Responsive: reduce shadow on mobile */
	@media (max-width: 640px) {
		.video-embed {
			box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
			border-radius: 4px;
		}
	}
</style>
