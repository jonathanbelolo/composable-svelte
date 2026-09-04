<script lang="ts">
	import type { VideoEmbed as VideoEmbedType, AspectRatio } from './types.js';
	import type { VideoPlatform } from './types.js';
	import { detectVideo } from './video-detection.js';

	/**
	 * VideoEmbed Component
	 *
	 * Component for embedding videos from YouTube, Vimeo and Twitch.
	 *
	 * Takes either a `url` to detect, or an already-detected `video`.
	 *
	 * Features:
	 * - Responsive iframe with aspect ratio preservation
	 * - Lazy loading for performance
	 * - Full accessibility support (ARIA, keyboard nav)
	 * - Security: sandbox attributes, referrer policy
	 */

	interface BaseProps {
		/** Custom CSS class */
		class?: string | undefined;

		/** Enable autoplay (default: false, usually blocked by browsers) */
		autoplay?: boolean | undefined;

		/** Start muted. Required by most browsers for autoplay to be permitted. */
		muted?: boolean | undefined;

		/** Override the platform's default aspect ratio. */
		aspectRatio?: AspectRatio | undefined;

		/** Show video title above embed (default: false) */
		showTitle?: boolean | undefined;
	}

	/**
	 * Either a URL to detect, or a video already detected.
	 *
	 * `url` is what the README and the skill file have always documented, and it
	 * did not exist: the component's only required prop was `video`, and with no
	 * rest-spread a `url` passed in was silently dropped — so the documented
	 * example rendered nothing. `video` stays for callers who detect themselves,
	 * which is everything already written against this component.
	 *
	 * Expressed as a union so passing both, or neither, is a compile error rather
	 * than a runtime surprise.
	 */
	type Props = BaseProps &
		(
			| { url: string; video?: undefined }
			| { video: VideoEmbedType; url?: undefined }
		);

	let {
		url,
		video: providedVideo,
		class: className = '',
		autoplay = false,
		muted = false,
		aspectRatio,
		showTitle = false
	}: Props = $props();

	/**
	 * The video to render: detected from `url`, or the one supplied.
	 *
	 * `null` when a `url` matches no known platform, which is a legitimate state
	 * — the component renders nothing rather than throwing, so a page with one
	 * bad link is not a page that fails to render.
	 */
	const video = $derived(providedVideo ?? (url ? detectVideo(url) : null));

	// Get aspect ratio padding-bottom percentage
	const aspectRatioPadding = $derived(() => {
		// The prop wins over the platform default. `aspectRatio` was in the
		// README's props table and did not exist on the component.
		switch (aspectRatio ?? video?.aspectRatio) {
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
		if (!video) return '';

		const embed = new URL(video.embedUrl);
		// Twitch spells booleans out; YouTube and Vimeo use 1/0.
		const yes = video.platform === 'twitch' ? 'true' : '1';

		if (autoplay) embed.searchParams.set('autoplay', yes);

		// `muted` was in EmbedOptions and in every buildEmbedUrl, and the component
		// never applied it — so the documented prop did nothing. It matters beyond
		// preference: browsers refuse autoplay with sound.
		if (muted) embed.searchParams.set(video.platform === 'youtube' ? 'mute' : 'muted', yes);

		// Twitch requires `parent` and it must match the embedding page. Detection
		// deliberately does not set it — it cannot know the host — so this is the
		// point where it becomes knowable. Guarded on `window` so server rendering
		// emits the URL without it rather than inventing `localhost`, which is the
		// hydration mismatch the comment above warns about.
		if (video.platform === 'twitch' && typeof window !== 'undefined') {
			embed.searchParams.set('parent', window.location.hostname);
		}

		return embed.toString();
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
		return video ? names[video.platform] : '';
	});
</script>

<!--
	Nothing is rendered when a `url` matches no known platform. `detectVideo`
	returns null for an unrecognised URL, and a page with one bad link should not
	be a page that fails to render.
-->
{#if video}
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
{/if}

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
		background: hsl(var(--muted, 0 0% 96.1%));
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--foreground, 0 0% 20%));
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
		outline: 2px solid hsl(var(--primary, 211.3 100% 50%));
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
