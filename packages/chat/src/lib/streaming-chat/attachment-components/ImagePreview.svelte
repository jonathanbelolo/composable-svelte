<script lang="ts">
	/**
	 * ImagePreview Component
	 *
	 * Displays image attachments with zoom, fullscreen, and lightbox features.
	 * Supports various image formats (JPEG, PNG, GIF, WebP, SVG).
	 */
	import { onMount } from 'svelte';
	import { animateFadeIn } from '@composable-svelte/core/animation';
	import type { MessageAttachment } from '../types.js';
	import { formatFileSize } from '../utils.js';

	interface Props {
		/** Image attachment to display */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string | undefined;
		/** Show image info header (default: true) */
		showHeader?: boolean | undefined;
		/** Allow fullscreen view (default: true) */
		allowFullscreen?: boolean | undefined;
	}

	let { attachment, class: className = '', showHeader = true, allowFullscreen = true }: Props = $props();

	// State
	let imgRef: HTMLImageElement | undefined = $state();
	let containerRef: HTMLDivElement | undefined = $state();
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let isFullscreen = $state(false);
	let naturalWidth = $state(0);
	let naturalHeight = $state(0);

	onMount(() => {
		document.addEventListener('fullscreenchange', handleFullscreenChange);
		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		};
	});

	function handleLoad() {
		if (!imgRef) return;
		naturalWidth = imgRef.naturalWidth;
		naturalHeight = imgRef.naturalHeight;
		isLoading = false;
	}

	function handleError() {
		error = 'Failed to load image';
		isLoading = false;
	}

	/**
	 * Which image has already faded in.
	 *
	 * A plain `let`, not `$state` — writing it inside the effect that reads it
	 * would re-trigger that effect. Keyed on the URL rather than a bare boolean
	 * so a component handed a different attachment fades the new one in too.
	 */
	let fadedInFor: string | undefined;

	/** The source the load state below currently describes. Also a plain `let`. */
	let sourceUrl: string | undefined;

	/**
	 * A new `attachment` is a new load, and nothing said so.
	 *
	 * `isLoading` was set once at construction and never reset, so swapping the
	 * prop left `ready` already true: the fade fired immediately on the element
	 * still painting the *previous* image — visible, blink out, fade back in —
	 * and then never fired for the new one, which arrived at full opacity with no
	 * entrance and no spinner. `AttachmentPreviewModal` reuses one instance
	 * rather than keying, so this is reachable.
	 */
	$effect(() => {
		const url = attachment.url;
		if (sourceUrl === url) return;

		const isFirstRun = sourceUrl === undefined;
		sourceUrl = url;
		// On the first run the markup already rendered in this state; writing it
		// again would only risk clobbering a load that beat the effect.
		if (isFirstRun) return;

		isLoading = true;
		error = null;
		fadedInFor = undefined;
		// The header reads these. Left alone, it described image A while the
		// spinner was up for image B.
		naturalWidth = 0;
		naturalHeight = 0;
	});

	// Was `img { opacity: 0 }` plus `img.loaded { opacity: 1 }` and a CSS
	// transition — a state-driven lifecycle the policy prohibits, and one that
	// rendered every server-side image permanently invisible, since `$effect`
	// never runs there and `.loaded` is only ever added by a client-side load
	// handler. `animateFadeIn` supplies its own `opacity: [0, 1]`, so the resting
	// state in CSS is simply "visible".
	$effect(() => {
		const element = imgRef;
		const ready = !isLoading && !error;
		const url = attachment.url;

		if (!element || !ready || fadedInFor === url) return;

		fadedInFor = url;
		void animateFadeIn(element);
	});

	async function toggleFullscreen() {
		if (!containerRef || !allowFullscreen) return;

		try {
			if (!isFullscreen) {
				await containerRef.requestFullscreen();
			} else {
				await document.exitFullscreen();
			}
		} catch (err) {
			console.error('Fullscreen error:', err);
		}
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	function handleImageClick() {
		// No guard: the button's `disabled` is the exact same condition, so this
		// only runs when it is already satisfied. Repeating it here was a branch
		// that could not be false, and two places to keep in step.
		toggleFullscreen();
	}

	// Format dimensions
	const dimensions = $derived(
		naturalWidth && naturalHeight ? `${naturalWidth} × ${naturalHeight}` : ''
	);
</script>

<div
	bind:this={containerRef}
	class="image-preview {className}"
	class:fullscreen={isFullscreen}
	class:clickable={allowFullscreen && !isFullscreen}
>
	<!-- Header -->
	{#if showHeader && !isFullscreen}
		<div class="image-preview-header">
			<div class="image-preview-title">
				<span class="image-icon">🖼️</span>
				<div class="image-info">
					<span class="image-filename">{attachment.filename}</span>
					<div class="image-meta">
						<span class="image-filesize">{formatFileSize(attachment.size)}</span>
						{#if dimensions}
							<span class="image-separator">•</span>
							<span class="image-dimensions">{dimensions}</span>
						{/if}
					</div>
				</div>
			</div>
			{#if allowFullscreen && !isLoading && !error}
				<button class="fullscreen-btn" onclick={toggleFullscreen} aria-label="View fullscreen">
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path
							d="M3.5 3.5A.5.5 0 014 3h3a.5.5 0 010 1H4.5v2.5a.5.5 0 01-1 0v-3zm9 0a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-1 0V4.5H13a.5.5 0 01-.5-.5zm-9 9a.5.5 0 01.5.5V16h2.5a.5.5 0 010 1H4a.5.5 0 01-.5-.5v-3a.5.5 0 01.5-.5zm13 0a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 010-1h2.5v-2.5a.5.5 0 01.5-.5z"
						/>
					</svg>
				</button>
			{/if}
		</div>
	{/if}

	<!-- Image Container -->
	<div class="image-container">
		{#if isLoading}
			<div class="image-loading">
				<div class="spinner"></div>
				<p>Loading image...</p>
			</div>
		{/if}

		{#if error}
			<div class="image-error">
				<span class="error-icon">⚠️</span>
				<p>{error}</p>
			</div>
		{/if}

		<button
			type="button"
			class="image-preview__zoom"
			onclick={handleImageClick}
			disabled={!allowFullscreen || isFullscreen || error !== null}
			aria-label="View {attachment.filename} fullscreen"
		>
			<!-- Hidden on error, and that is not cosmetic: with the fade moved to
			     Motion One the `<img>`'s resting opacity is 1, so a failed load
			     painted its broken-image placeholder straight over the ⚠️ card
			     below. `opacity: 0` used to hide it as a side effect. -->
			{#if !error}
				<img
					bind:this={imgRef}
					src={attachment.url}
					alt={attachment.filename}
					onload={handleLoad}
					onerror={handleError}
				/>
			{/if}
		</button>

		<!-- Fullscreen overlay controls -->
		{#if isFullscreen}
			<div class="fullscreen-controls">
				<button class="fullscreen-close-btn" onclick={toggleFullscreen} aria-label="Exit fullscreen">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M6 6l12 12m0-12L6 18"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.image-preview {
		display: flex;
		flex-direction: column;
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 220 13% 91%));
		border-radius: 0.5rem;
		overflow: hidden;
		max-width: 800px;
	}

	.image-preview.fullscreen {
		max-width: none;
		border: none;
		border-radius: 0;
		background: hsl(var(--foreground, 0 0% 0%));
	}

	.image-preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted, 210 20% 98%));
		border-bottom: 1px solid hsl(var(--border, 220 13% 91%));
		gap: 1rem;
	}

	.image-preview-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
		min-width: 0;
	}

	.image-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.image-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.image-filename {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground, 220.9 39.3% 11%));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.image-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground, 220 8.9% 46.1%));
	}

	.image-separator {
		color: hsl(var(--foreground, 216 12.2% 83.9%));
	}

	.fullscreen-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 216 12.2% 83.9%));
		border-radius: 0.375rem;
		color: hsl(var(--muted-foreground, 216.9 19.1% 26.7%));
		cursor: pointer;
		flex-shrink: 0;
	}

	.fullscreen-btn:hover {
		background: hsl(var(--muted, 210 20% 98%));
		border-color: hsl(var(--muted-foreground, 217.9 10.6% 64.9%));
	}

	.fullscreen-btn:focus-visible {
		outline: 2px solid hsl(var(--primary, 217.2 91.2% 59.8%));
		outline-offset: 2px;
	}

	.image-container {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted, 210 20% 98%));
		min-height: 200px;
	}

	.fullscreen .image-container {
		min-height: 100vh;
		background: hsl(var(--foreground, 0 0% 0%));
	}

	/* The wrapper is a real button for keyboard access, and had no rule at all —
	   so every image in the gallery and the preview modal rendered inside default
	   UA button chrome: a grey `buttonface` box with a 2px outset border. */
	.image-preview__zoom {
		display: block;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		max-width: 100%;
	}

	img {
		display: block;
		max-width: 100%;
		max-height: 600px;
		width: auto;
		height: auto;
	}

	.fullscreen img {
		max-height: 100vh;
		max-width: 100vw;
		object-fit: contain;
	}

	.image-preview.clickable img {
		cursor: zoom-in;
	}

	.image-preview.clickable img:hover {
		/* Was `opacity: 0.9`, which the fade-in's committed inline opacity now
		   outranks — one property, one author. `filter` keeps the same feedback
		   on a property nothing else writes. */
		filter: brightness(0.92);
	}

	.image-loading,
	.image-error {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 2rem;
	}

	.image-loading {
		color: hsl(var(--muted-foreground, 220 8.9% 46.1%));
	}

	.image-error {
		color: hsl(var(--destructive, 0 72.2% 50.6%));
	}

	.spinner {
		width: 2rem;
		height: 2rem;
		border: 3px solid hsl(var(--border, 220 13% 91%));
		border-top-color: hsl(var(--primary, 217.2 91.2% 59.8%));
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-icon {
		font-size: 2rem;
	}

	.image-loading p,
	.image-error p {
		margin: 0;
		font-size: 0.875rem;
	}

	.fullscreen-controls {
		position: absolute;
		top: 1rem;
		right: 1rem;
	}

	.fullscreen-close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 0.375rem;
		color: hsl(var(--background, 0 0% 100%));
		cursor: pointer;
	}

	.fullscreen-close-btn:hover {
		background: rgba(0, 0, 0, 0.8);
	}

	.fullscreen-close-btn:focus-visible {
		outline: 2px solid hsl(var(--background, 0 0% 100%));
		outline-offset: 2px;
	}
</style>
