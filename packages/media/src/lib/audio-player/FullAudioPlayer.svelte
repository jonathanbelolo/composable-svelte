<script lang="ts">
	/**
	 * Full Audio Player
	 *
	 * Complete audio player with all advanced features.
	 *
	 * Features:
	 * - All MinimalAudioPlayer features
	 * - Previous/Next track buttons
	 * - Skip forward/backward (10s)
	 * - Speed control
	 * - Loop mode (none, one, all)
	 * - Shuffle mode
	 * - Expand to full-screen view
	 * - Keyboard shortcuts
	 */

	import type { Store } from '@composable-svelte/core';
	import { Tooltip } from '@composable-svelte/core';
	import type { AudioPlayerState, AudioPlayerAction, LoopMode } from './types.js';
	import { getAudioManager, deleteAudioManager } from './audio-manager.js';
	import { onMount } from 'svelte';

	interface Props {
		/** Store containing audio player state */
		store: Store<AudioPlayerState, AudioPlayerAction>;
		/** Optional CSS class */
		class?: string;
		/** Show expand button (default: true) */
		showExpandButton?: boolean;
		/** Show playlist info (default: true) */
		showPlaylistInfo?: boolean;
		/** Unique ID for this player instance */
		id?: string;
	}

	let {
		store,
		class: className = '',
		showExpandButton = true,
		showPlaylistInfo = true,
		id = 'full-audio-player'
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

	// Speed control dropdown
	let showSpeedMenu = $state(false);

	// Playback speed presets
	const speedPresets = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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

	// Buffered percentage
	const bufferedPercent = $derived(
		state.duration > 0 ? (state.buffered / state.duration) * 100 : 0
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

	// Handle speed change
	function setSpeed(speed: number) {
		store.dispatch({ type: 'speedChanged', speed });
		showSpeedMenu = false;
	}

	// Handle loop mode toggle
	function toggleLoopMode() {
		const modes: LoopMode[] = ['none', 'one', 'all'];
		const currentIndex = modes.indexOf(state.loopMode);
		const nextIndex = (currentIndex + 1) % modes.length;

		store.dispatch({ type: 'loopModeChanged', mode: modes[nextIndex] });
	}

	// Get loop mode icon
	const loopModeIcon = $derived(() => {
		switch (state.loopMode) {
			case 'none':
				return '↻';
			case 'one':
				return '↻1';
			case 'all':
				return '↻∞';
		}
	});

	// Keyboard shortcuts
	function handleKeyDown(event: KeyboardEvent) {
		// Don't handle if user is typing in an input
		if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
			return;
		}

		switch (event.key) {
			case ' ':
			case 'k':
				event.preventDefault();
				handlePlayPause();
				break;

			case 'ArrowLeft':
				event.preventDefault();
				store.dispatch({ type: 'skipBackward', seconds: 5 });
				break;

			case 'ArrowRight':
				event.preventDefault();
				store.dispatch({ type: 'skipForward', seconds: 5 });
				break;

			case 'j':
				event.preventDefault();
				store.dispatch({ type: 'skipBackward', seconds: 10 });
				break;

			case 'l':
				event.preventDefault();
				store.dispatch({ type: 'skipForward', seconds: 10 });
				break;

			case 'ArrowUp':
				event.preventDefault();
				store.dispatch({ type: 'volumeUp', amount: 0.05 });
				break;

			case 'ArrowDown':
				event.preventDefault();
				store.dispatch({ type: 'volumeDown', amount: 0.05 });
				break;

			case 'm':
				event.preventDefault();
				store.dispatch({ type: 'toggleMute' });
				break;

			case '<':
				event.preventDefault();
				setSpeed(Math.max(0.25, state.playbackSpeed - 0.25));
				break;

			case '>':
				event.preventDefault();
				setSpeed(Math.min(2, state.playbackSpeed + 0.25));
				break;

			case 'Home':
				event.preventDefault();
				store.dispatch({ type: 'seekTo', time: 0 });
				break;

			case 'End':
				event.preventDefault();
				store.dispatch({ type: 'seekTo', time: state.duration });
				break;
		}
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

		// Add keyboard shortcuts
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			// Clean up drag listeners if still active
			if (cleanupDrag) {
				cleanupDrag();
			}

			deleteAudioManager(id);
			audioManager = null;
			loadedTrackUrl = null;
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div class="full-audio-player {className}" role="region" aria-label="Audio player">
	<!-- Track info header -->
	{#if state.currentTrack}
		<div class="track-header">
			{#if state.currentTrack.coverArt}
				<img
					src={state.currentTrack.coverArt}
					alt="{state.currentTrack.title} cover"
					class="cover-art-large"
				/>
			{/if}
			<div class="track-details-large">
				<div class="track-title-large">{state.currentTrack.title}</div>
				{#if state.currentTrack.artist}
					<div class="track-artist-large">{state.currentTrack.artist}</div>
				{/if}
				{#if state.currentTrack.album}
					<div class="track-album">{state.currentTrack.album}</div>
				{/if}
				{#if showPlaylistInfo && state.playlist.length > 0}
					<div class="playlist-info">
						Track {state.currentTrackIndex + 1} of {state.playlist.length}
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Progress section -->
	<div class="progress-section">
		<div
			class="progress-bar-large"
			role="slider"
			aria-label="Seek"
			aria-valuemin={0}
			aria-valuemax={state.duration}
			aria-valuenow={displayTime}
			tabindex="0"
			onclick={handleProgressClick}
			onmousedown={handleProgressMouseDown}
		>
			<div class="progress-buffered" style="width: {bufferedPercent}%"></div>
			<div class="progress-fill-large" style="width: {progressPercent}%"></div>
			<div class="progress-thumb-large" style="left: {progressPercent}%"></div>
		</div>

		<div class="time-display-large">
			<span class="current-time-large">{formatTime(displayTime)}</span>
			<span class="duration-large">{formatTime(state.duration)}</span>
		</div>
	</div>

	<!-- Main controls -->
	<div class="main-controls">
		<!-- Shuffle button -->
		<button
			class="control-btn {state.isShuffled ? 'active' : ''}"
			onclick={() => store.dispatch({ type: 'shuffleToggled' })}
			disabled={state.playlist.length < 2}
			aria-label="Shuffle"
			title="Shuffle"
		>
			<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"
				/>
			</svg>
		</button>

		<!-- Previous track -->
		<button
			class="control-btn"
			onclick={() => store.dispatch({ type: 'previous' })}
			disabled={state.playlist.length === 0}
			aria-label="Previous track"
			title="Previous (or restart)"
		>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
			</svg>
		</button>

		<!-- Skip backward 10s -->
	<Tooltip content="Skip backward 10s">
		<button
			class="control-btn"
			onclick={() => store.dispatch({ type: 'skipBackward', seconds: 10 })}
			disabled={!state.currentTrack}
			aria-label="Skip backward 10 seconds"
		>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
				<path
					d="M20 6v12l-8.5-6L20 6zm-9 0v12l-8.5-6L11 6z"
				/>
			</svg>
		</button>
	</Tooltip>

		<!-- Play/Pause button (large) -->
		<button
			class="play-pause-btn-large"
			onclick={handlePlayPause}
			disabled={!state.currentTrack}
			aria-label={state.isPlaying ? 'Pause' : 'Play'}
		>
			{#if state.isLoading}
				<span class="loading-spinner-large">⏳</span>
			{:else if state.isPlaying}
				<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
					<rect x="6" y="4" width="4" height="16" />
					<rect x="14" y="4" width="4" height="16" />
				</svg>
			{:else}
				<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
					<path d="M8 5v14l11-7z" />
				</svg>
			{/if}
		</button>

		<!-- Skip forward 10s -->
	<Tooltip content="Skip forward 10s">
		<button
			class="control-btn"
			onclick={() => store.dispatch({ type: 'skipForward', seconds: 10 })}
			disabled={!state.currentTrack}
			aria-label="Skip forward 10 seconds"
		>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
				<path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
			</svg>
		</button>
	</Tooltip>

		<!-- Next track -->
		<button
			class="control-btn"
			onclick={() => store.dispatch({ type: 'next' })}
			disabled={state.playlist.length === 0}
			aria-label="Next track"
			title="Next track"
		>
			<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
				<path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
			</svg>
		</button>

		<!-- Loop mode -->
		<button
			class="control-btn {state.loopMode !== 'none' ? 'active' : ''}"
			onclick={toggleLoopMode}
			aria-label="Loop mode: {state.loopMode}"
			title="Loop mode: {state.loopMode}"
		>
			<span class="loop-icon">{loopModeIcon()}</span>
		</button>
	</div>

	<!-- Secondary controls -->
	<div class="secondary-controls">
		<!-- Volume control -->
		<div class="volume-control-large">
			<button
				class="volume-icon-large"
				onclick={() => store.dispatch({ type: 'toggleMute' })}
				aria-label={state.isMuted ? 'Unmute' : 'Mute'}
			>
				{#if state.isMuted || state.volume === 0}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"
						/>
					</svg>
				{:else if state.volume < 0.5}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M7 9v6h4l5 5V4l-5 5H7z" />
					</svg>
				{:else}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
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
				class="volume-slider-large"
				aria-label="Volume"
			/>
		</div>

		<!-- Speed control -->
		<div class="speed-control">
			<button
				class="speed-btn"
				onclick={() => (showSpeedMenu = !showSpeedMenu)}
				aria-label="Playback speed: {state.playbackSpeed}x"
			>
				{state.playbackSpeed}x
			</button>

			{#if showSpeedMenu}
				<div class="speed-menu">
					{#each speedPresets as speed}
						<button
							class="speed-option {state.playbackSpeed === speed ? 'active' : ''}"
							onclick={() => setSpeed(speed)}
						>
							{speed}x
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Expand button -->
		{#if showExpandButton}
			<button
				class="expand-btn"
				onclick={() => store.dispatch({ type: 'toggleExpanded' })}
				aria-label={state.isExpanded ? 'Collapse' : 'Expand'}
				title={state.isExpanded ? 'Collapse' : 'Expand'}
			>
				{#if state.isExpanded}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
					</svg>
				{:else}
					<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
						<path
							d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
						/>
					</svg>
				{/if}
			</button>
		{/if}
	</div>

	<!-- Error display -->
	{#if state.error}
		<div class="error-message-large" role="alert">
			{state.error}
		</div>
	{/if}

	<!-- Buffering indicator -->
	{#if state.isBuffering}
		<div class="buffering-indicator">Buffering...</div>
	{/if}
</div>

<style>
	.full-audio-player {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding: 1.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		color: white;
		font-family: system-ui, -apple-system, sans-serif;
		max-width: 600px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
	}

	.track-header {
		display: flex;
		gap: 1rem;
		align-items: flex-start;
	}

	.cover-art-large {
		width: 120px;
		height: 120px;
		border-radius: 8px;
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.track-details-large {
		flex: 1;
		min-width: 0;
	}

	.track-title-large {
		font-weight: 700;
		font-size: 1.5rem;
		margin-bottom: 0.5rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track-artist-large {
		font-size: 1.1rem;
		opacity: 0.9;
		margin-bottom: 0.25rem;
	}

	.track-album {
		font-size: 0.9rem;
		opacity: 0.7;
		margin-bottom: 0.5rem;
	}

	.playlist-info {
		font-size: 0.85rem;
		opacity: 0.7;
	}

	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.progress-bar-large {
		height: 8px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		position: relative;
		cursor: pointer;
	}

	.progress-buffered {
		position: absolute;
		height: 100%;
		background: rgba(255, 255, 255, 0.3);
		border-radius: 4px;
		transition: width 0.3s;
	}

	.progress-fill-large {
		position: absolute;
		height: 100%;
		background: white;
		border-radius: 4px;
		transition: width 0.1s;
	}

	.progress-thumb-large {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		width: 16px;
		height: 16px;
		background: white;
		border-radius: 50%;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		opacity: 0;
		transition: opacity 0.2s;
	}

	.progress-bar-large:hover .progress-thumb-large,
	.progress-bar-large:focus .progress-thumb-large {
		opacity: 1;
	}

	.time-display-large {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		opacity: 0.9;
	}

	.main-controls {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
	}

	.control-btn {
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 50%;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		cursor: pointer;
		transition: all 0.2s;
		position: relative;
	}

	.control-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.25);
		transform: scale(1.05);
	}

	.control-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.control-btn.active {
		background: rgba(255, 255, 255, 0.3);
	}

	.skip-label {
		position: absolute;
		font-size: 0.7rem;
		font-weight: 600;
		pointer-events: none;
	}

	.loop-icon {
		font-size: 1.3rem;
	}

	.play-pause-btn-large {
		width: 64px;
		height: 64px;
		border-radius: 50%;
		border: none;
		background: white;
		color: #667eea;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		transition: all 0.2s;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.play-pause-btn-large:hover:not(:disabled) {
		transform: scale(1.1);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
	}

	.play-pause-btn-large:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.loading-spinner-large {
		font-size: 1.5rem;
	}

	.secondary-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.volume-control-large {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.volume-icon-large {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.2s;
	}

	.volume-icon-large:hover {
		transform: scale(1.1);
	}

	.volume-slider-large {
		flex: 1;
		height: 6px;
		border-radius: 3px;
		background: rgba(255, 255, 255, 0.2);
		outline: none;
		-webkit-appearance: none;
		appearance: none;
	}

	.volume-slider-large::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: white;
		cursor: pointer;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
	}

	.volume-slider-large::-moz-range-thumb {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: white;
		cursor: pointer;
		border: none;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
	}

	.speed-control {
		position: relative;
	}

	.speed-btn {
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 20px;
		padding: 0.5rem 1rem;
		color: white;
		cursor: pointer;
		font-size: 0.9rem;
		font-weight: 600;
		transition: background 0.2s;
		min-width: 60px;
	}

	.speed-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.speed-menu {
		position: absolute;
		bottom: 100%;
		right: 0;
		margin-bottom: 0.5rem;
		background: white;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		padding: 0.5rem;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.25rem;
		z-index: 10;
	}

	.speed-option {
		background: transparent;
		border: none;
		border-radius: 4px;
		padding: 0.5rem;
		color: #667eea;
		cursor: pointer;
		font-size: 0.85rem;
		font-weight: 600;
		transition: background 0.2s;
	}

	.speed-option:hover {
		background: #f0f0f0;
	}

	.speed-option.active {
		background: #667eea;
		color: white;
	}

	.expand-btn {
		background: rgba(255, 255, 255, 0.15);
		border: none;
		border-radius: 50%;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		cursor: pointer;
		transition: all 0.2s;
	}

	.expand-btn:hover {
		background: rgba(255, 255, 255, 0.25);
		transform: scale(1.05);
	}

	.error-message-large {
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.2);
		color: white;
		border-radius: 6px;
		font-size: 0.9rem;
		text-align: center;
	}

	.buffering-indicator {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(0, 0, 0, 0.7);
		color: white;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.85rem;
	}
</style>
