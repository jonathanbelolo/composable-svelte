<script lang="ts">
	/**
	 * VideoPlayer Component
	 *
	 * Custom video player for uploaded video attachments.
	 * Features play/pause, seek, volume, fullscreen, picture-in-picture.
	 */
	import { onMount } from 'svelte';
	import { animateFadeIn, animateFadeOut } from '@composable-svelte/core/animation';
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
	/**
	 * A transient playback complaint, distinct from `error`.
	 *
	 * `error` means the source is unusable and latches the whole player behind
	 * `{#if !error}`. This one means "that attempt did not start" and clears
	 * itself the moment one does.
	 */
	let playbackNotice = $state<string | null>(null);
	let isFullscreen = $state(false);
	let showControls = $state(true);
	let controlsTimeout: number | undefined;
	let controlsRef: HTMLDivElement | undefined = $state();

	/** The source the playback state below currently describes. A plain `let`. */
	let sourceUrl: string | undefined;

	/**
	 * A new `attachment` is a new video, and `error` never unset itself.
	 *
	 * `error` gates the entire control bar and the play overlay behind
	 * `{#if !error}`, and nothing cleared it — so a failed load turned the
	 * component into a permanently broken player, and handing it a perfectly
	 * good second video left the ⚠️ card up with no controls.
	 * `AttachmentPreviewModal` renders `<VideoPlayer {attachment} />` unkeyed, so
	 * it reuses one instance; the identical defect in `ImagePreview` was fixed
	 * and this one was missed.
	 */
	$effect(() => {
		const url = attachment.url;
		if (sourceUrl === url) return;

		const isFirstRun = sourceUrl === undefined;
		sourceUrl = url;
		if (isFirstRun) return;

		error = null;
		// Or the complaint about the *previous* source is painted over the new one
		// — the same latch this reset exists to break, one variable along.
		playbackNotice = null;
		isLoading = true;
		isPlaying = false;
		currentTime = 0;
		duration = 0;
		// Not cosmetic. `showControls` also drives the `.visible` class, which is
		// the only thing restoring `pointer-events`. Leaving it `false` across a
		// swap rebuilds the bar at its resting CSS opacity — fully visible — and
		// unclickable, which reads as a broken player rather than a hidden one.
		showControls = true;
	});

	/**
	 * What the controls were last animated to. A plain `let`, not `$state`: the
	 * effect below writes it, and a rune would make that a self-trigger.
	 *
	 * A boolean is enough, and an earlier `{ element, shown }` pair was not the
	 * improvement its comment claimed. The bar can be replaced — it lives inside
	 * `{#if !error}` and `error` now clears on a new source — but the same reset
	 * puts `showControls` back to `true`, and "visible" is the resting state in
	 * CSS. So a replacement never needs placing.
	 */
	let controlsShown: boolean | undefined;

	/**
	 * Was `transition: opacity 0.2s` between `.video-controls` and
	 * `.video-controls.visible` — a state-driven lifecycle in CSS, which the
	 * policy prohibits because the store can neither sequence on it nor cancel it.
	 *
	 * Not, as an earlier version of this comment claimed, because the resting
	 * `opacity: 0` hid server-rendered controls: `showControls` starts `true`, so
	 * the server emits the `visible` class and they were visible. That claim is
	 * true of `ImagePreview`, whose `.loaded` class only a client handler adds,
	 * and it was copied here without being checked.
	 *
	 * Deliberately asymmetric. Showing is instant: the user is moving the mouse
	 * right now, and 0.2s of fade before the controls answer is latency, not
	 * polish. Hiding fades, because that one happens *to* the user after three
	 * idle seconds rather than in reply to them.
	 *
	 * The instant show still goes through Motion rather than an inline style: a
	 * fade-out already in flight is a Web Animation, and a Web Animation outranks
	 * inline style, so assigning `opacity` would let it finish and hide the
	 * controls the user just asked for.
	 */
	$effect(() => {
		const element = controlsRef;
		const shown = showControls;

		if (!element || controlsShown === shown) return;

		const isFirstRun = controlsShown === undefined;
		controlsShown = shown;

		// On the first run, place — and placing here means writing nothing at all.
		// The controls' resting state in CSS *is* visible, which is the whole
		// point of moving the fade out of CSS, so an opening inline `opacity: 1`
		// would only paper over a regression back to `opacity: 0`.
		if (isFirstRun) return;

		void (shown ? animateFadeIn(element, { duration: 0 }) : animateFadeOut(element));
	});

	onMount(() => {
		// Read *from* the element rather than writing to it. Both assignments used
		// to go the other way, setting `volume` and `playbackRate` to the values
		// the element already had — two statements that could not change anything,
		// and a silent trap if either initial value were ever edited. Seeding the
		// state from the element makes the element the authority for where
		// playback starts, which is what the controls then follow.
		if (videoRef) {
			volume = videoRef.volume;
			playbackRate = videoRef.playbackRate;
		}

		// Outside the `if`: the teardown below removes this unconditionally, so
		// registering it conditionally is an asymmetry waiting to bite.
		document.addEventListener('fullscreenchange', handleFullscreenChange);

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
				// Deliberately not `error`. Everything below — the whole control
				// bar and the play overlay — renders behind `{#if !error}`, so one
				// rejected `play()` used to remove the player permanently. A
				// rejection here is transient (an interrupted play, an autoplay
				// policy); a source that genuinely cannot load fires `onerror`,
				// which still latches.
				//
				// It is not silent either: dropping the assignment altogether
				// traded a permanent dead-end for an invisible one — a click that
				// does nothing, with only a console line to show for it.
				playbackNotice = 'Could not start playback. Try again.';
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
		// Whatever the last attempt could not do, this one did.
		playbackNotice = null;
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
	role="group"
	aria-label="Video player"
	onfocusin={handleMouseMove}
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
		>
			<!-- Rendered unconditionally: the a11y check looks for a literal
			     <track> child and an {#if}-wrapped one does not satisfy it. With no
			     captions in metadata the element carries no src, so the browser
			     creates an empty disabled TextTrack and makes no request. -->
			<track
				kind="captions"
				src={attachment.metadata?.captions?.src}
				srclang={attachment.metadata?.captions?.srclang}
				label={attachment.metadata?.captions?.label}
			/>
		</video>

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

		<!-- Transient playback complaint. `role="status"` rather than an alert:
		     it is feedback on the click just made, not an interruption. -->
		{#if playbackNotice && !error}
			<p class="video-playback-notice" role="status">{playbackNotice}</p>
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
			<div bind:this={controlsRef} class="video-controls" class:visible={showControls}>
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

	.video-playback-notice {
		position: absolute;
		left: 50%;
		bottom: 5rem;
		transform: translateX(-50%);
		margin: 0;
		padding: 0.375rem 0.75rem;
		border-radius: 0.375rem;
		background: rgba(0, 0, 0, 0.75);
		color: white;
		font-size: 0.8125rem;
		z-index: 3;
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
		/* No `opacity` here on purpose: the fade belongs to Motion One, and one
		   property may have only one author. */
		pointer-events: none;
	}

	.video-controls.visible {
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
