<script lang="ts">
	/**
	 * ImagePreview Component
	 *
	 * Displays image attachments with zoom, fullscreen, and lightbox features.
	 * Supports various image formats (JPEG, PNG, GIF, WebP, SVG).
	 */
	import { onMount } from 'svelte';
	import type { MessageAttachment } from '../types.js';
	import { formatFileSize } from '../utils.js';

	interface Props {
		/** Image attachment to display */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string;
		/** Show image info header (default: true) */
		showHeader?: boolean;
		/** Allow fullscreen view (default: true) */
		allowFullscreen?: boolean;
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
		if (allowFullscreen && !isFullscreen) {
			toggleFullscreen();
		}
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

		<img
			bind:this={imgRef}
			src={attachment.url}
			alt={attachment.filename}
			class:loaded={!isLoading && !error}
			onload={handleLoad}
			onerror={handleError}
			onclick={handleImageClick}
		/>

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
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		max-width: 800px;
	}

	.image-preview.fullscreen {
		max-width: none;
		border: none;
		border-radius: 0;
		background: black;
	}

	.image-preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
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
		color: #111827;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.image-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: #6b7280;
	}

	.image-separator {
		color: #d1d5db;
	}

	.fullscreen-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		color: #374151;
		cursor: pointer;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.fullscreen-btn:hover {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.fullscreen-btn:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	.image-container {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #f9fafb;
		min-height: 200px;
	}

	.fullscreen .image-container {
		min-height: 100vh;
		background: black;
	}

	img {
		display: block;
		max-width: 100%;
		max-height: 600px;
		width: auto;
		height: auto;
		opacity: 0;
		transition: opacity 0.2s;
	}

	img.loaded {
		opacity: 1;
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
		opacity: 0.9;
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
		color: #6b7280;
	}

	.image-error {
		color: #dc2626;
	}

	.spinner {
		width: 2rem;
		height: 2rem;
		border: 3px solid #e5e7eb;
		border-top-color: #3b82f6;
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
		color: white;
		cursor: pointer;
		transition: background-color 0.15s;
	}

	.fullscreen-close-btn:hover {
		background: rgba(0, 0, 0, 0.8);
	}

	.fullscreen-close-btn:focus-visible {
		outline: 2px solid white;
		outline-offset: 2px;
	}
</style>
