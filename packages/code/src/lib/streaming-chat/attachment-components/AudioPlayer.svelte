<script lang="ts">
	/**
	 * AudioPlayer Component
	 *
	 * Custom audio player with controls for chat attachments.
	 * Features play/pause, seek, volume, playback speed.
	 */
	import { onMount } from 'svelte';
	import type { MessageAttachment } from '../types.js';
	import { formatFileSize } from '../utils.js';

	interface Props {
		/** Audio attachment to play */
		attachment: MessageAttachment;
		/** Optional class name */
		class?: string;
	}

	let { attachment, class: className = '' }: Props = $props();

	// Audio element ref
	let audioRef: HTMLAudioElement | undefined = $state();

	// Playback state
	let isPlaying = $state(false);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(1);
	let playbackRate = $state(1);
	let isSeeking = $state(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	onMount(() => {
		if (audioRef) {
			// Set initial volume
			audioRef.volume = volume;
			audioRef.playbackRate = playbackRate;
		}
	});

	function togglePlay() {
		if (!audioRef) return;

		if (isPlaying) {
			audioRef.pause();
		} else {
			audioRef.play().catch((err) => {
				error = 'Failed to play audio';
				console.error('Audio playback error:', err);
			});
		}
	}

	function handleTimeUpdate() {
		if (!audioRef || isSeeking) return;
		currentTime = audioRef.currentTime;
	}

	function handleLoadedMetadata() {
		if (!audioRef) return;
		duration = audioRef.duration;
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
		error = 'Failed to load audio file';
		isLoading = false;
	}

	function handleSeekStart() {
		isSeeking = true;
	}

	function handleSeek(event: Event) {
		if (!audioRef) return;
		const target = event.target as HTMLInputElement;
		const time = parseFloat(target.value);
		audioRef.currentTime = time;
		currentTime = time;
	}

	function handleSeekEnd() {
		isSeeking = false;
	}

	function handleVolumeChange(event: Event) {
		if (!audioRef) return;
		const target = event.target as HTMLInputElement;
		const newVolume = parseFloat(target.value);
		volume = newVolume;
		audioRef.volume = newVolume;
	}

	function handleSpeedChange(event: Event) {
		if (!audioRef) return;
		const target = event.target as HTMLSelectElement;
		const newRate = parseFloat(target.value);
		playbackRate = newRate;
		audioRef.playbackRate = newRate;
	}

	function formatTime(seconds: number): string {
		if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Calculate progress percentage
	const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
</script>

<div class="audio-player {className}">
	<!-- Header -->
	<div class="audio-player-header">
		<div class="audio-player-title">
			<span class="audio-icon">🎵</span>
			<div class="audio-info">
				<span class="audio-filename">{attachment.filename}</span>
				<span class="audio-filesize">{formatFileSize(attachment.size)}</span>
			</div>
		</div>
	</div>

	<!-- Hidden audio element -->
	<audio
		bind:this={audioRef}
		src={attachment.url}
		ontimeupdate={handleTimeUpdate}
		onloadedmetadata={handleLoadedMetadata}
		onplay={handlePlay}
		onpause={handlePause}
		onended={handleEnded}
		onerror={handleError}
		preload="metadata"
	></audio>

	<!-- Error State -->
	{#if error}
		<div class="audio-player-error">
			<span class="error-icon">⚠️</span>
			<p>{error}</p>
		</div>
	{:else}
		<!-- Controls -->
		<div class="audio-player-controls">
			<!-- Play/Pause Button -->
			<button
				class="audio-play-btn"
				onclick={togglePlay}
				disabled={isLoading}
				aria-label={isPlaying ? 'Pause' : 'Play'}
			>
				{#if isLoading}
					<span class="audio-spinner"></span>
				{:else if isPlaying}
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path d="M6 4h3v12H6V4zm5 0h3v12h-3V4z" />
					</svg>
				{:else}
					<svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
						<path d="M6 4l10 6-10 6V4z" />
					</svg>
				{/if}
			</button>

			<!-- Time Display -->
			<span class="audio-time">{formatTime(currentTime)}</span>

			<!-- Progress Bar -->
			<div class="audio-progress-container">
				<input
					type="range"
					class="audio-progress"
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

			<!-- Duration -->
			<span class="audio-time">{formatTime(duration)}</span>

			<!-- Volume Control -->
			<div class="audio-volume">
				<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
					<path
						d="M8 3.5v9a.5.5 0 01-.812.39L4.312 10.5H2.5A1.5 1.5 0 011 9V7a1.5 1.5 0 011.5-1.5h1.812l2.876-2.39A.5.5 0 018 3.5zM11.025 6.464a.5.5 0 01.707-.707 3.5 3.5 0 010 4.95.5.5 0 01-.707-.707 2.5 2.5 0 000-3.536z"
					/>
				</svg>
				<input
					type="range"
					class="audio-volume-slider"
					min="0"
					max="1"
					step="0.01"
					value={volume}
					oninput={handleVolumeChange}
					aria-label="Volume"
				/>
			</div>

			<!-- Playback Speed -->
			<select class="audio-speed" onchange={handleSpeedChange} value={playbackRate}>
				<option value="0.5">0.5x</option>
				<option value="0.75">0.75x</option>
				<option value="1">1x</option>
				<option value="1.25">1.25x</option>
				<option value="1.5">1.5x</option>
				<option value="2">2x</option>
			</select>
		</div>
	{/if}
</div>

<style>
	.audio-player {
		display: flex;
		flex-direction: column;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		overflow: hidden;
		max-width: 600px;
	}

	.audio-player-header {
		padding: 0.75rem 1rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.audio-player-title {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.audio-icon {
		font-size: 1.5rem;
		flex-shrink: 0;
	}

	.audio-info {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
		min-width: 0;
	}

	.audio-filename {
		font-size: 0.875rem;
		font-weight: 500;
		color: #111827;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.audio-filesize {
		font-size: 0.75rem;
		color: #6b7280;
	}

	.audio-player-error {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		color: #dc2626;
	}

	.error-icon {
		font-size: 1.25rem;
	}

	.audio-player-error p {
		margin: 0;
		font-size: 0.875rem;
	}

	.audio-player-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: white;
	}

	.audio-play-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		background: #3b82f6;
		border: none;
		border-radius: 50%;
		color: white;
		cursor: pointer;
		transition: background-color 0.15s;
		flex-shrink: 0;
	}

	.audio-play-btn:hover:not(:disabled) {
		background: #2563eb;
	}

	.audio-play-btn:active:not(:disabled) {
		background: #1d4ed8;
	}

	.audio-play-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.audio-spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.audio-time {
		font-size: 0.75rem;
		color: #6b7280;
		font-variant-numeric: tabular-nums;
		min-width: 2.5rem;
		text-align: center;
	}

	.audio-progress-container {
		flex: 1;
		min-width: 0;
	}

	.audio-progress {
		width: 100%;
		height: 0.25rem;
		appearance: none;
		background: transparent;
		cursor: pointer;
	}

	.audio-progress::-webkit-slider-runnable-track {
		width: 100%;
		height: 0.25rem;
		background: linear-gradient(
			to right,
			#3b82f6 0%,
			#3b82f6 var(--progress),
			#e5e7eb var(--progress),
			#e5e7eb 100%
		);
		border-radius: 0.125rem;
	}

	.audio-progress::-webkit-slider-thumb {
		appearance: none;
		width: 0.875rem;
		height: 0.875rem;
		background: #3b82f6;
		border-radius: 50%;
		margin-top: -0.3125rem;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.audio-progress::-moz-range-track {
		width: 100%;
		height: 0.25rem;
		background: #e5e7eb;
		border-radius: 0.125rem;
	}

	.audio-progress::-moz-range-progress {
		height: 0.25rem;
		background: #3b82f6;
		border-radius: 0.125rem;
	}

	.audio-progress::-moz-range-thumb {
		width: 0.875rem;
		height: 0.875rem;
		background: #3b82f6;
		border: none;
		border-radius: 50%;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
	}

	.audio-progress:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.audio-volume {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: #6b7280;
	}

	.audio-volume svg {
		flex-shrink: 0;
	}

	.audio-volume-slider {
		width: 4rem;
		height: 0.25rem;
		appearance: none;
		background: #e5e7eb;
		border-radius: 0.125rem;
		cursor: pointer;
	}

	.audio-volume-slider::-webkit-slider-thumb {
		appearance: none;
		width: 0.75rem;
		height: 0.75rem;
		background: #6b7280;
		border-radius: 50%;
	}

	.audio-volume-slider::-moz-range-thumb {
		width: 0.75rem;
		height: 0.75rem;
		background: #6b7280;
		border: none;
		border-radius: 50%;
	}

	.audio-speed {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		color: #374151;
		background: white;
		border: 1px solid #d1d5db;
		border-radius: 0.375rem;
		cursor: pointer;
		flex-shrink: 0;
	}

	.audio-speed:hover {
		border-color: #9ca3af;
	}

	.audio-speed:focus-visible {
		outline: 2px solid #3b82f6;
		outline-offset: 2px;
	}

	@media (max-width: 640px) {
		.audio-player-controls {
			flex-wrap: wrap;
		}

		.audio-progress-container {
			order: -1;
			flex-basis: 100%;
		}

		.audio-volume {
			display: none;
		}
	}
</style>
