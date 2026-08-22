<script lang="ts">
	import type { VideoEmbed as VideoEmbedType } from './types.js';
	import type { VideoPlatform } from './types.js';

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

	let {
		video,
		class: className = '',
		autoplay = false,
		showTitle = false
	}: Props = $props();

	// Get aspect ratio padding-bottom percentage
	const aspectRatioPadding = $derived(() => {
		switch (video.aspectRatio) {
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

	// The embed URL, with autoplay applied to the URL the caller supplied.
	//
	// `video.embedUrl` comes from the extractors, which call `buildEmbedUrl` with
	// no options — so nothing in `EmbedOptions` reached it and this component's
	// `autoplay` prop was inert.
	//
	// Applied as a parameter rather than by rebuilding from the platform config,
	// which was the first fix and was wrong: a caller who supplies
	// `youtube-nocookie.com/embed/abc?start=90&rel=0` would have had the host,
	// the start offset and `rel=0` all silently replaced by a canonical URL —
	// toggling one boolean changing four things. It also made Twitch's `parent`
	// parameter recompute at render time, and that reads `window.location`, so
	// the server emitted `parent=localhost` and the client disagreed on
	// hydration.
	const embedUrl = $derived.by(() => {
		if (!autoplay) return video.embedUrl;
		const url = new URL(video.embedUrl);
		// Twitch spells it `true`; YouTube and Vimeo spell it `1`.
		url.searchParams.set('autoplay', video.platform === 'twitch' ? 'true' : '1');
		return url.toString();
	});

	// Build iframe allow attribute
	const iframeAllow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';

	// Get platform display name.
	//
	// Typed as a total map over `VideoPlatform` rather than `Record<string, …>`,
	// so adding a platform to the union without a name here is a compile error
	// instead of a silent fallback to "Video". The four names removed alongside
	// this — Twitter, TikTok, Dailymotion, generic — were for platforms the
	// extractor has no registry entry for and can never produce.
	const platformName = $derived(() => {
		const names: Record<VideoPlatform, string> = {
			youtube: 'YouTube',
			vimeo: 'Vimeo',
			twitch: 'Twitch'
		};
		// No `?? 'Video'`: the map is total over the union, so the fallback had no
		// reachable trigger. An unreachable recovery path is the same dead
		// behaviour this campaign is removing everywhere else.
		return names[video.platform];
	});
</script>

<div class="video-embed {className}" role="region" aria-label="Embedded video">
	{#if showTitle && video.title}
		<div class="video-embed__title">
			{video.title}
		</div>
	{/if}

	<div class="video-embed__container" style="padding-bottom: {aspectRatioPadding()};">
		<iframe
			src={embedUrl}
			title={video.title || `${platformName()} video player`}
			class="video-embed__iframe"
			frameborder="0"
			allow={iframeAllow}
			allowfullscreen
			loading="lazy"
			sandbox="allow-scripts allow-same-origin allow-presentation"
			referrerpolicy="no-referrer"
			aria-label={`${platformName()} video player`}
		></iframe>
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
