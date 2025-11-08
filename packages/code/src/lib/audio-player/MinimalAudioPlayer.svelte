<script lang="ts">
	/**
	 * Minimal Audio Player
	 *
	 * Compact, embeddable audio player for single tracks.
	 * Perfect for chat messages or small spaces.
	 *
	 * Features:
	 * - Play/pause button
	 * - Progress bar with seeking
	 * - Time display (current / duration)
	 * - Volume control
	 */

	import type { Store } from '@composable-svelte/core';
	import type { AudioPlayerState, AudioPlayerAction } from './types.js';
	import { getAudioManager, deleteAudioManager } from './audio-manager.js';
	import { onMount } from 'svelte';

	interface Props {
		/** Store containing audio player state */
		store: Store<AudioPlayerState, AudioPlayerAction>;
		/** Optional CSS class */
		class?: string;
		/** Show volume control (default: true) */
		showVolume?: boolean;
		/** Unique ID for this player instance */
		id?: string;
	}

	let {
		store,
		class: className = '',
		showVolume = true,
		id = 'minimal-audio-player'
	}: Props = $props();

	const state = $derived($store);

	// Audio manager
	let audioManager: ReturnType<typeof getAudioManager> | null = null;

	// Seeking state (local to component)
	let isSeeking = $state(false);

	// Track the currently loaded URL to avoid unnecessary reloads
	let loadedTrackUrl = $state<string | null>(null);

	// Cleanup function for drag event listeners
	let cleanupDrag: (() => void) | null = null;

	// Format time as MM:SS
	function formatTime(seconds: number): string {
		if (!isFinite(seconds) || isNaN(seconds)) return '0:00';

		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Get display time (current or seek position)
	const displayTime = $derived(state.seekPosition ?? state.currentTime);

	// Progress percentage
	const progressPercent = $derived(
		state.duration > 0 ? (displayTime / state.duration) * 100 : 0
	);

	// Handle play/pause toggle
	function handlePlayPause() {
		store.dispatch({ type: 'togglePlayPause' });
	}

	// Handle progress bar click
	function handleProgressClick(event: MouseEvent) {
		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percent = x / rect.width;
		const time = percent * state.duration;

		store.dispatch({ type: 'seekTo', time });
	}

	// Handle progress bar drag
	function handleProgressMouseDown(event: MouseEvent) {
		// Clean up any existing drag listeners
		if (cleanupDrag) {
			cleanupDrag();
		}

		isSeeking = true;

		const target = event.currentTarget as HTMLElement;
		const rect = target.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const percent = x / rect.width;
		const time = percent * state.duration;

		store.dispatch({ type: 'seekStarted', position: time });

		function handleMouseMove(e: MouseEvent) {
			const x = e.clientX - rect.left;
			const percent = Math.max(0, Math.min(1, x / rect.width));
			const time = percent * state.duration;

			store.dispatch({ type: 'seekUpdated', position: time });
		}

		function handleMouseUp(e: MouseEvent) {
			const x = e.clientX - rect.left;
			const percent = Math.max(0, Math.min(1, x / rect.width));
			const time = percent * state.duration;

			store.dispatch({ type: 'seekEnded', position: time });

			isSeeking = false;

			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			cleanupDrag = null;
		}

		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);

		// Store cleanup function
		cleanupDrag = () => {
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			isSeeking = false;
			cleanupDrag = null;
		};
	}

	// Handle volume change
	function handleVolumeChange(event: Event) {
		const target = event.target as HTMLInputElement;
		const volume = parseFloat(target.value);

		store.dispatch({ type: 'volumeChanged', volume });
	}

	// Sync audio manager with state
	$effect(() => {
		if (!audioManager) return;

		// Update audio element based on state changes
		const track = state.currentTrack;

		// Load track only if URL changed
		if (track && track.url !== loadedTrackUrl) {
			audioManager.loadTrack(track);
			loadedTrackUrl = track.url;
		} else if (!track && loadedTrackUrl !== null) {
			loadedTrackUrl = null;
		}

		if (state.isPlaying && audioManager.getAudioElement().paused) {
			audioManager.play();
		} else if (!state.isPlaying && !audioManager.getAudioElement().paused) {
			audioManager.pause();
		}

		audioManager.setVolume(state.volume);
		audioManager.setPlaybackSpeed(state.playbackSpeed);

		// Seek if needed (and not currently seeking)
		if (!isSeeking && Math.abs(audioManager.getAudioElement().currentTime - state.currentTime) > 0.5) {
			audioManager.seek(state.currentTime);
		}
	});

	// Initialize audio manager on mount
	onMount(() => {
		audioManager = getAudioManager(id, {
			onAction: (action) => {
				store.dispatch(action);
			}
		});

		// Load initial track if available
		if (state.currentTrack) {
			audioManager.loadTrack(state.currentTrack);
			loadedTrackUrl = state.currentTrack.url;
		}

		return () => {
			// Clean up drag listeners if still active
			if (cleanupDrag) {
				cleanupDrag();
			}

			deleteAudioManager(id);
			audioManager = null;
			loadedTrackUrl = null;
		};
	});
</script>

<div class="minimal-audio-player {className}" role="region" aria-label="Audio player">
	<!-- Track info (if available) -->
	{#if state.currentTrack}
		<div class="track-info">
			{#if state.currentTrack.coverArt}
				<img
					src={state.currentTrack.coverArt}
					alt="{state.currentTrack.title} cover"
					class="cover-art"
				/>
			{/if}
			<div class="track-details">
				<div class="track-title">{state.currentTrack.title}</div>
				{#if state.currentTrack.artist}
					<div class="track-artist">{state.currentTrack.artist}</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Controls row -->
	<div class="controls-row">
		<!-- Play/Pause button -->
		<button
			class="play-pause-btn"
			onclick={handlePlayPause}
			disabled={!state.currentTrack}
			aria-label={state.isPlaying ? 'Pause' : 'Play'}
		>
			{#if state.isLoading}
				<span class="loading-spinner">⏳</span>
			{:else if state.isPlaying}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" />
					<rect x="14" y="4" width="4" height="16" />
				</svg>
			{:else}
				<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
					<path d="M8 5v14l11-7z" />
				</svg>
			{/if}
		</button>

		<!-- Progress bar -->
		<div class="progress-container">
			<div
				class="progress-bar"
				role="slider"
				aria-label="Seek"
				aria-valuemin={0}
				aria-valuemax={state.duration}
				aria-valuenow={displayTime}
				tabindex="0"
				onclick={handleProgressClick}
				onmousedown={handleProgressMouseDown}
			>
				<div class="progress-fill" style="width: {progressPercent}%"></div>
				<div class="progress-thumb" style="left: {progressPercent}%"></div>
			</div>

			<!-- Time display -->
			<div class="time-display">
				<span class="current-time">{formatTime(displayTime)}</span>
				<span class="separator">/</span>
				<span class="duration">{formatTime(state.duration)}</span>
			</div>
		</div>

		<!-- Volume control -->
		{#if showVolume}
			<div class="volume-control">
				<button
					class="volume-icon"
					onclick={() => store.dispatch({ type: 'toggleMute' })}
					aria-label={state.isMuted ? 'Unmute' : 'Mute'}
				>
					{#if state.isMuted || state.volume === 0}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
							/>
						</svg>
					{:else if state.volume < 0.5}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path d="M7 9v6h4l5 5V4l-5 5H7z" />
						</svg>
					{:else}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"
							/>
						</svg>
					{/if}
				</button>

				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={state.volume}
					oninput={handleVolumeChange}
					class="volume-slider"
					aria-label="Volume"
				/>
			</div>
		{/if}
	</div>

	<!-- Error display -->
	{#if state.error}
		<div class="error-message" role="alert">
			{state.error}
		</div>
	{/if}
</div>

<style>
	.minimal-audio-player {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.75rem;
		background: #f8f9fa;
		border-radius: 8px;
		border: 1px solid #e9ecef;
		font-family: system-ui, -apple-system, sans-serif;
		max-width: 500px;
	}

	.track-info {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.cover-art {
		width: 48px;
		height: 48px;
		border-radius: 4px;
		object-fit: cover;
	}

	.track-details {
		flex: 1;
		min-width: 0;
	}

	.track-title {
		font-weight: 600;
		font-size: 0.9rem;
		color: #212529;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track-artist {
		font-size: 0.8rem;
		color: #6c757d;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.controls-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.play-pause-btn {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		border: none;
		background: #007bff;
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: background 0.2s;
	}

	.play-pause-btn:hover:not(:disabled) {
		background: #0056b3;
	}

	.play-pause-btn:disabled {
		background: #adb5bd;
		cursor: not-allowed;
	}

	.loading-spinner {
		font-size: 1.2rem;
	}

	.progress-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.progress-bar {
		height: 6px;
		background: #dee2e6;
		border-radius: 3px;
		position: relative;
		cursor: pointer;
	}

	.progress-fill {
		height: 100%;
		background: #007bff;
		border-radius: 3px;
		transition: width 0.1s;
	}

	.progress-thumb {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 12px;
		height: 12px;
		background: #007bff;
		border-radius: 50%;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.progress-bar:hover .progress-thumb,
	.progress-bar:focus .progress-thumb {
		opacity: 1;
	}

	.time-display {
		display: flex;
		gap: 0.25rem;
		font-size: 0.75rem;
		color: #6c757d;
		justify-content: center;
	}

	.volume-control {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.volume-icon {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: #495057;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.volume-icon:hover {
		color: #212529;
	}

	.volume-slider {
		width: 80px;
		height: 6px;
		border-radius: 3px;
		background: #dee2e6;
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.volume-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #007bff;
		cursor: pointer;
	}

	.volume-slider::-moz-range-thumb {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: #007bff;
		cursor: pointer;
		border: none;
	}

	.error-message {
		padding: 0.5rem;
		background: #f8d7da;
		color: #721c24;
		border-radius: 4px;
		font-size: 0.85rem;
		text-align: center;
	}
</style>
