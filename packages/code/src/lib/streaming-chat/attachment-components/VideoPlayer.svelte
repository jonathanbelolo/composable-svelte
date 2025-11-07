<script lang="ts">
	/**
	 * VideoPlayer Component
	 *
	 * Custom video player for uploaded video attachments.
	 * Features play/pause, seek, volume, fullscreen, picture-in-picture.
	 */
	import { onMount } from 'svelte';
	import type { MessageAttachment } from '../types.js';
	import { formatFileSize } from '../utils.js';

	interface Props {
		/** Video attachment to play */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string;
		/** Auto-play (default: false) */
		autoplay?: boolean;
	}

	let { attachment, class: className = '', autoplay = false }: Props = $props();

	// Video element ref
	let videoRef: HTMLVideoElement | undefined = $state();
	let containerRef: HTMLDivElement | undefined = $state();

	// Playback state
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let isMuted = $state(false);
	let playbackRate = $state(1);
	let isSeeking = $state(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let isFullscreen = $state(false);
	let showControls = $state(true);
	let controlsTimeout: number | undefined;

	onMount(() => {
		if (videoRef) {
			videoRef.volume = volume;
			videoRef.playbackRate = playbackRate;

			// Handle fullscreen change
			document.addEventListener('fullscreenchange', handleFullscreenChange);
		}

		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			if (controlsTimeout) clearTimeout(controlsTimeout);
		};
	});

	function togglePlay() {
		if (!videoRef) return;

		if (isPlaying) {
			videoRef.pause();
		} else {
			videoRef.play().catch((err) => {
				error = 'Failed to play video';
				console.error('Video playback error:', err);
			});
		}
	}

	function handleTimeUpdate() {
		if (!videoRef || isSeeking) return;
		currentTime = videoRef.currentTime;
	}

	function handleLoadedMetadata() {
		if (!videoRef) return;
		duration = videoRef.duration;
		isLoading = false;
	}

	function handlePlay() {
		isPlaying = true;
	}

	function handlePause() {
		isPlaying = false;
	}

	function handleEnded() {
		isPlaying = false;
		currentTime = 0;
	}

	function handleError() {
		error = 'Failed to load video file';
		isLoading = false;
	}

	function handleSeekStart() {
		isSeeking = true;
	}

	function handleSeek(event: Event) {
		if (!videoRef) return;
		const target = event.target as HTMLInputElement;
		const time = parseFloat(target.value);
		videoRef.currentTime = time;
		currentTime = time;
	}

	function handleSeekEnd() {
		isSeeking = false;
	}

	function handleVolumeChange(event: Event) {
		if (!videoRef) return;
		const target = event.target as HTMLInputElement;
		const newVolume = parseFloat(target.value);
		volume = newVolume;
		videoRef.volume = newVolume;
		isMuted = newVolume === 0;
	}

	function toggleMute() {
		if (!videoRef) return;
		isMuted = !isMuted;
		videoRef.muted = isMuted;
	}

	function handleSpeedChange(event: Event) {
		if (!videoRef) return;
		const target = event.target as HTMLSelectElement;
		const newRate = parseFloat(target.value);
		playbackRate = newRate;
		videoRef.playbackRate = newRate;
	}

	async function toggleFullscreen() {
		if (!containerRef) return;

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

	async function togglePictureInPicture() {
		if (!videoRef) return;

		try {
			if (document.pictureInPictureElement) {
				await document.exitPictureInPicture();
			} else {
				await videoRef.requestPictureInPicture();
			}
		} catch (err) {
			console.error('Picture-in-picture error:', err);
		}
	}

	function handleFullscreenChange() {
		isFullscreen = !!document.fullscreenElement;
	}

	function handleMouseMove() {
		showControls = true;
		if (controlsTimeout) clearTimeout(controlsTimeout);

		// Hide controls after 3 seconds of inactivity when playing
		if (isPlaying) {
			controlsTimeout = window.setTimeout(() => {
				showControls = false;
			}, 3000);
		}
	}

	function formatTime(seconds: number): string {
		if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
</script>

<div
	bind:this={containerRef}
	class="video-player {className}"
	class:fullscreen={isFullscreen}
	onmousemove={handleMouseMove}
	onmouseleave={() => isPlaying && (showControls = false)}
>
	<!-- Video Header (when not fullscreen) -->
	{#if !isFullscreen}
		<div class="video-player-header">
			<div class="video-player-title">
				<span class="video-icon">🎥</span>
				<div class="video-info">
					<span class="video-filename">{attachment.filename}</span>
					<span class="video-filesize">{formatFileSize(attachment.size)}</span>
				</div>
			</div>
		</div>
	{/if}

	<!-- Video Element -->
	<div class="video-container">
		<video
			bind:this={videoRef}
			src={attachment.url}
			poster={attachment.metadata?.thumbnail}
			{autoplay}
			ontimeupdate={handleTimeUpdate}
			onloadedmetadata={handleLoadedMetadata}
			onplay={handlePlay}
			onpause={handlePause}
			onended={handleEnded}
			onerror={handleError}
			preload="metadata"
			onclick={togglePlay}
		></video>

		<!-- Loading Overlay -->
		{#if isLoading}
			<div class="video-overlay">
				<div class="video-spinner"></div>
			</div>
		{/if}

		<!-- Error Overlay -->
		{#if error}
			<div class="video-overlay video-error">
				<span class="error-icon">⚠️</span>
				<p>{error}</p>
			</div>
		{/if}

		<!-- Play Button Overlay -->
		{#if !isPlaying && !isLoading && !error}
			<button class="video-play-overlay" onclick={togglePlay} aria-label="Play video">
				<svg width="64" height="64" viewBox="0 0 64 64" fill="currentColor">
					<circle cx="32" cy="32" r="32" fill="rgba(0, 0, 0, 0.6)" />
					<path d="M24 16l24 16-24 16V16z" fill="white" />
				</svg>
			</button>
		{/if}

		<!-- Controls -->
		{#if !error}
			<div class="video-controls" class:visible={showControls}>
				<!-- Progress Bar -->
				<div class="video-progress-container">
					<input
						type="range"
						class="video-progress"
						min="0"
						max={duration || 0}
						value={currentTime}
						oninput={handleSeek}
						onmousedown={handleSeekStart}
						onmouseup={handleSeekEnd}
						ontouchstart={handleSeekStart}
						ontouchend={handleSeekEnd}
						disabled={isLoading}
						style="--progress: {progress}%"
					/>
				</div>

				<!-- Control Buttons -->
				<div class="video-controls-bar">
					<!-- Play/Pause -->
					<button class="video-btn" onclick={togglePlay} aria-label={isPlaying ? 'Pause' : 'Play'}>
						{#if isPlaying}
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path d="M6 4h3v12H6V4zm5 0h3v12h-3V4z" />
							</svg>
						{:else}
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path d="M6 4l10 6-10 6V4z" />
							</svg>
						{/if}
					</button>

					<!-- Time -->
					<span class="video-time">{formatTime(currentTime)} / {formatTime(duration)}</span>

					<div class="video-spacer"></div>

					<!-- Volume -->
					<div class="video-volume">
						<button class="video-btn" onclick={toggleMute} aria-label={isMuted ? 'Unmute' : 'Mute'}>
							{#if isMuted || volume === 0}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
									<path
										d="M10 3.5v13a.5.5 0 01-.812.39L6.312 14.5H4.5A1.5 1.5 0 013 13v-2a1.5 1.5 0 011.5-1.5h1.812l2.876-2.39A.5.5 0 0110 3.5zm4.854 2.646a.5.5 0 010 .708L13.207 9l1.647 1.646a.5.5 0 11-.708.708L12.5 9.707l-1.646 1.647a.5.5 0 01-.708-.708L11.793 9l-1.647-1.646a.5.5 0 01.708-.708l1.646 1.647 1.646-1.647a.5.5 0 01.708 0z"
									/>
								</svg>
							{:else}
								<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
									<path
										d="M10 3.5v13a.5.5 0 01-.812.39L6.312 14.5H4.5A1.5 1.5 0 013 13v-2a1.5 1.5 0 011.5-1.5h1.812l2.876-2.39A.5.5 0 0110 3.5zM14.025 7.464a.5.5 0 01.707-.707 4.5 4.5 0 010 6.364.5.5 0 01-.707-.707 3.5 3.5 0 000-4.95z"
									/>
								</svg>
							{/if}
						</button>
						<input
							type="range"
							class="video-volume-slider"
							min="0"
							max="1"
							step="0.01"
							value={volume}
							oninput={handleVolumeChange}
							aria-label="Volume"
						/>
					</div>

					<!-- Speed -->
					<select class="video-speed" onchange={handleSpeedChange} value={playbackRate}>
						<option value="0.5">0.5x</option>
						<option value="0.75">0.75x</option>
						<option value="1">1x</option>
						<option value="1.25">1.25x</option>
						<option value="1.5">1.5x</option>
						<option value="2">2x</option>
					</select>

					<!-- Picture-in-Picture -->
					<button class="video-btn" onclick={togglePictureInPicture} aria-label="Picture-in-Picture">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
							<path
								d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm9 7a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 01-1 1h-2a1 1 0 01-1-1v-2z"
							/>
						</svg>
					</button>

					<!-- Fullscreen -->
					<button class="video-btn" onclick={toggleFullscreen} aria-label="Fullscreen">
						{#if isFullscreen}
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path
									d="M3.5 8a.5.5 0 01.5-.5h2a.5.5 0 010 1H4.5v1.5a.5.5 0 01-1 0V8zm9 0a.5.5 0 01.5-.5h2.5v1.5a.5.5 0 001 0V8a.5.5 0 00-.5-.5h-3a.5.5 0 00-.5.5v.5zm-9 4.5v-1a.5.5 0 011 0V13h1.5a.5.5 0 010 1H4a.5.5 0 01-.5-.5zm13 0a.5.5 0 01-.5.5h-2a.5.5 0 010-1h1.5v-1.5a.5.5 0 011 0v2z"
								/>
							</svg>
						{:else}
							<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
								<path
									d="M3.5 3.5A.5.5 0 014 3h3a.5.5 0 010 1H4.5v2.5a.5.5 0 01-1 0v-3zm9 0a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v3a.5.5 0 01-1 0V4.5H13a.5.5 0 01-.5-.5zm-9 9a.5.5 0 01.5.5V16h2.5a.5.5 0 010 1H4a.5.5 0 01-.5-.5v-3a.5.5 0 01.5-.5zm13 0a.5.5 0 01.5.5v3a.5.5 0 01-.5.5h-3a.5.5 0 010-1h2.5v-2.5a.5.5 0 01.5-.5z"
								/>
							</svg>
						{/if}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.video-player {
		display: flex;
		flex-direction: column;
		background: black;
		border-radius: 0.5rem;
		overflow: hidden;
		max-width: 800px;
	}

	.video-player.fullscreen {
		max-width: none;
		border-radius: 0;
	}

	.video-player-header {
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.video-player-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.video-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.video-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.video-filename {
		font-size: 0.875rem;
		font-weight: 500;
		color: #111827;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.video-filesize {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.video-container {
		position: relative;
		background: black;
		aspect-ratio: 16 / 9;
	}

	.fullscreen .video-container {
		aspect-ratio: unset;
		height: 100vh;
	}

	video {
		width: 100%;
		height: 100%;
		display: block;
		cursor: pointer;
	}

	.video-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		background: rgba(0, 0, 0, 0.8);
		color: white;
		pointer-events: none;
	}

	.video-spinner {
		width: 3rem;
		height: 3rem;
		border: 4px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.video-error {
		color: #fca5a5;
	}

	.error-icon {
		font-size: 3rem;
	}

	.video-error p {
		margin: 0;
		font-size: 1rem;
	}

	.video-play-overlay {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		transition: opacity 0.2s, transform 0.2s;
	}

	.video-play-overlay:hover {
		transform: translate(-50%, -50%) scale(1.1);
	}

	.video-controls {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
		padding: 2rem 1rem 1rem;
		opacity: 0;
		transition: opacity 0.2s;
		pointer-events: none;
	}

	.video-controls.visible {
		opacity: 1;
		pointer-events: all;
	}

	.video-progress-container {
		margin-bottom: 0.75rem;
	}

	.video-progress {
		width: 100%;
		height: 0.25rem;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	.video-progress::-webkit-slider-runnable-track {
		width: 100%;
		height: 0.25rem;
		background: linear-gradient(
			to right,
			#3b82f6 0%,
			#3b82f6 var(--progress),
			rgba(255, 255, 255, 0.3) var(--progress),
			rgba(255, 255, 255, 0.3) 100%
		);
		border-radius: 0.125rem;
	}

	.video-progress::-webkit-slider-thumb {
		appearance: none;
		width: 0.875rem;
		height: 0.875rem;
		background: #3b82f6;
		border-radius: 50%;
		margin-top: -0.3125rem;
	}

	.video-progress::-moz-range-track {
		width: 100%;
		height: 0.25rem;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 0.125rem;
	}

	.video-progress::-moz-range-progress {
		height: 0.25rem;
		background: #3b82f6;
		border-radius: 0.125rem;
	}

	.video-progress::-moz-range-thumb {
		width: 0.875rem;
		height: 0.875rem;
		background: #3b82f6;
		border: none;
		border-radius: 50%;
	}

	.video-controls-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.video-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		background: none;
		border: none;
		color: white;
		cursor: pointer;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}

	.video-btn:hover {
		opacity: 0.7;
	}

	.video-time {
		font-size: 0.875rem;
		color: white;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.video-spacer {
		flex: 1;
	}

	.video-volume {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.video-volume-slider {
		width: 4rem;
		height: 0.25rem;
		appearance: none;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 0.125rem;
		cursor: pointer;
	}

	.video-volume-slider::-webkit-slider-thumb {
		appearance: none;
		width: 0.75rem;
		height: 0.75rem;
		background: white;
		border-radius: 50%;
	}

	.video-volume-slider::-moz-range-thumb {
		width: 0.75rem;
		height: 0.75rem;
		background: white;
		border: none;
		border-radius: 50%;
	}

	.video-speed {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: white;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 0.25rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.video-speed:hover {
		background: rgba(255, 255, 255, 0.2);
	}

	@media (max-width: 640px) {
		.video-volume {
			display: none;
		}

		.video-speed {
			display: none;
		}
	}
</style>
