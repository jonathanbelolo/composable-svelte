<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from '../types.js';
	import AudioVisualizer from './AudioVisualizer.svelte';
	import RecordingTimer from './RecordingTimer.svelte';

	/**
	 * Push-to-Talk Panel Component
	 *
	 * Modal overlay that appears during push-to-talk recording.
	 * Shows audio visualization, timer, and cancel button.
	 */
	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
	}

	const { store }: Props = $props();

	function handleCancel() {
		store.dispatch({ type: 'cancelPushToTalkRecording' });
	}

	// Handle escape key
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleCancel();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="push-to-talk-panel">
	<div class="panel-backdrop" onclick={handleCancel} role="presentation"></div>

	<div class="panel-content">
		<h3 class="panel-title">Push to Talk</h3>

		<!-- Audio Visualizer -->
		<AudioVisualizer audioLevel={$store.audioLevel} variant="bars" />

		<!-- Recording Timer -->
		{#if $store.recordingStartTime}
			<RecordingTimer
				startTime={$store.recordingStartTime}
				maxDuration={60}
				onMaxDurationReached={handleCancel}
			/>
		{/if}

		<!-- Hint Text -->
		<p class="hint-text">Release to send · ESC to cancel</p>

		<!-- Cancel Button -->
		<button class="cancel-button" onclick={handleCancel}>Cancel</button>
	</div>
</div>

<style>
	.push-to-talk-panel {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.panel-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(4px);
		cursor: pointer;
	}

	.panel-content {
		position: relative;
		background: white;
		border-radius: 16px;
		padding: 32px;
		width: 100%;
		max-width: 400px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 24px;
		animation: slideUp 0.3s ease-out;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(20px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.panel-title {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #1a1a1a;
	}

	.hint-text {
		margin: 0;
		font-size: 14px;
		color: #666;
		text-align: center;
	}

	.cancel-button {
		padding: 10px 24px;
		border: 1px solid #e0e0e0;
		background: white;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		color: #666;
		cursor: pointer;
		transition:
			background 0.2s ease,
			border-color 0.2s ease,
			color 0.2s ease;
	}

	.cancel-button:hover {
		background: #f5f5f5;
		border-color: #ccc;
		color: #333;
	}

	.cancel-button:active {
		transform: scale(0.98);
	}

	/* Dark mode */
	@media (prefers-color-scheme: dark) {
		.panel-content {
			background: #2a2a2a;
		}

		.panel-title {
			color: #e0e0e0;
		}

		.hint-text {
			color: #999;
		}

		.cancel-button {
			background: #333;
			border-color: #444;
			color: #ccc;
		}

		.cancel-button:hover {
			background: #3a3a3a;
			border-color: #555;
			color: #fff;
		}
	}

	/* Mobile */
	@media (max-width: 640px) {
		.push-to-talk-panel {
			align-items: flex-end;
			padding: 0;
		}

		.panel-content {
			border-radius: 16px 16px 0 0;
			max-width: none;
			animation: slideUpMobile 0.3s ease-out;
		}

		@keyframes slideUpMobile {
			from {
				transform: translateY(100%);
			}
			to {
				transform: translateY(0);
			}
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.panel-content {
			animation: none;
		}
	}
</style>
