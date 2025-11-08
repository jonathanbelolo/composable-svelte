<script lang="ts">
	/**
	 * Playlist View
	 *
	 * Displays and manages the audio player playlist.
	 *
	 * Features:
	 * - Track list with metadata
	 * - Current track highlight
	 * - Click to select track
	 * - Drag-to-reorder
	 * - Remove track button
	 */

	import type { Store } from '@composable-svelte/core';
	import type { AudioPlayerState, AudioPlayerAction, AudioTrack } from './types.js';

	interface Props {
		/** Store containing audio player state */
		store: Store<AudioPlayerState, AudioPlayerAction>;
		/** Optional CSS class */
		class?: string;
		/** Show track numbers (default: true) */
		showTrackNumbers?: boolean;
		/** Show duration (default: true) */
		showDuration?: boolean;
		/** Enable drag-to-reorder (default: true) */
		enableReorder?: boolean;
		/** Enable remove track (default: true) */
		enableRemove?: boolean;
	}

	let {
		store,
		class: className = '',
		showTrackNumbers = true,
		showDuration = true,
		enableReorder = true,
		enableRemove = true
	}: Props = $props();

	const state = $derived($store);

	// Drag and drop state
	let draggedIndex = $state<number | null>(null);
	let dragOverIndex = $state<number | null>(null);

	// Format duration as MM:SS
	function formatDuration(seconds: number | undefined): string {
		if (!seconds || !isFinite(seconds)) return '--:--';

		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// Handle track selection
	function selectTrack(index: number) {
		store.dispatch({ type: 'trackSelected', index });
	}

	// Handle track removal
	function removeTrack(index: number, event: Event) {
		event.stopPropagation();
		store.dispatch({ type: 'trackRemoved', index });
	}

	// Drag and drop handlers
	function handleDragStart(index: number, event: DragEvent) {
		if (!enableReorder) return;

		draggedIndex = index;
		event.dataTransfer!.effectAllowed = 'move';
	}

	function handleDragOver(index: number, event: DragEvent) {
		if (!enableReorder || draggedIndex === null) return;

		event.preventDefault();
		event.dataTransfer!.dropEffect = 'move';
		dragOverIndex = index;
	}

	function handleDragLeave() {
		dragOverIndex = null;
	}

	function handleDrop(index: number, event: DragEvent) {
		if (!enableReorder || draggedIndex === null) return;

		event.preventDefault();

		if (draggedIndex !== index) {
			store.dispatch({ type: 'playlistReordered', from: draggedIndex, to: index });
		}

		draggedIndex = null;
		dragOverIndex = null;
	}

	function handleDragEnd() {
		draggedIndex = null;
		dragOverIndex = null;
	}
</script>

<div class="playlist-view {className}" role="list" aria-label="Playlist">
	{#if state.playlist.length === 0}
		<div class="empty-playlist">
			<svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
				<path
					d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"
				/>
			</svg>
			<p>No tracks in playlist</p>
		</div>
	{:else}
		{#each state.playlist as track, index (track.id)}
			<div
				class="playlist-item {index === state.currentTrackIndex ? 'active' : ''} {draggedIndex === index ? 'dragging' : ''} {dragOverIndex === index ? 'drag-over' : ''}"
				role="listitem"
				onclick={() => selectTrack(index)}
				ondragstart={(e) => handleDragStart(index, e)}
				ondragover={(e) => handleDragOver(index, e)}
				ondragleave={handleDragLeave}
				ondrop={(e) => handleDrop(index, e)}
				ondragend={handleDragEnd}
				draggable={enableReorder}
			>
				<!-- Drag handle -->
				{#if enableReorder}
					<div class="drag-handle" aria-label="Drag to reorder">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
							/>
						</svg>
					</div>
				{/if}

				<!-- Track number -->
				{#if showTrackNumbers}
					<div class="track-number">
						{#if index === state.currentTrackIndex && state.isPlaying}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" class="playing-icon">
								<path d="M8 5v14l11-7z" />
							</svg>
						{:else}
							{index + 1}
						{/if}
					</div>
				{/if}

				<!-- Cover art (if available) -->
				{#if track.coverArt}
					<img
						src={track.coverArt}
						alt="{track.title} cover"
						class="track-cover"
						draggable="false"
					/>
				{/if}

				<!-- Track info -->
				<div class="track-info-playlist">
					<div class="track-title-playlist">{track.title}</div>
					{#if track.artist}
						<div class="track-artist-playlist">{track.artist}</div>
					{/if}
				</div>

				<!-- Duration -->
				{#if showDuration}
					<div class="track-duration">{formatDuration(track.duration)}</div>
				{/if}

				<!-- Remove button -->
				{#if enableRemove}
					<button
						class="remove-btn"
						onclick={(e) => removeTrack(index, e)}
						aria-label="Remove {track.title}"
						title="Remove from playlist"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
							<path
								d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
							/>
						</svg>
					</button>
				{/if}
			</div>
		{/each}
	{/if}
</div>

<style>
	.playlist-view {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 400px;
		overflow-y: auto;
		padding: 0.5rem;
		background: #f8f9fa;
		border-radius: 8px;
	}

	.empty-playlist {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1rem;
		color: #6c757d;
		text-align: center;
	}

	.empty-playlist p {
		margin-top: 1rem;
		font-size: 0.9rem;
	}

	.playlist-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background: white;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
		border: 2px solid transparent;
	}

	.playlist-item:hover {
		background: #f0f0f0;
	}

	.playlist-item.active {
		background: #e7f3ff;
		border-color: #007bff;
	}

	.playlist-item.dragging {
		opacity: 0.5;
	}

	.playlist-item.drag-over {
		border-color: #007bff;
		border-style: dashed;
	}

	.drag-handle {
		cursor: grab;
		color: #adb5bd;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.drag-handle:active {
		cursor: grabbing;
	}

	.track-number {
		width: 24px;
		text-align: center;
		font-size: 0.85rem;
		color: #6c757d;
		font-weight: 600;
		flex-shrink: 0;
	}

	.playing-icon {
		color: #007bff;
	}

	.track-cover {
		width: 40px;
		height: 40px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.track-info-playlist {
		flex: 1;
		min-width: 0;
	}

	.track-title-playlist {
		font-weight: 600;
		font-size: 0.9rem;
		color: #212529;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track-artist-playlist {
		font-size: 0.8rem;
		color: #6c757d;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.track-duration {
		font-size: 0.85rem;
		color: #6c757d;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.remove-btn {
		background: none;
		border: none;
		padding: 0.25rem;
		cursor: pointer;
		color: #adb5bd;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s;
		flex-shrink: 0;
		opacity: 0;
	}

	.playlist-item:hover .remove-btn {
		opacity: 1;
	}

	.remove-btn:hover {
		background: #f8d7da;
		color: #721c24;
	}

	/* Custom scrollbar */
	.playlist-view::-webkit-scrollbar {
		width: 8px;
	}

	.playlist-view::-webkit-scrollbar-track {
		background: #e9ecef;
		border-radius: 4px;
	}

	.playlist-view::-webkit-scrollbar-thumb {
		background: #adb5bd;
		border-radius: 4px;
	}

	.playlist-view::-webkit-scrollbar-thumb:hover {
		background: #6c757d;
	}
</style>
