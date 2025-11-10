<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from '../types.js';
	import AudioVisualizer from './AudioVisualizer.svelte';
	import RecordingTimer from './RecordingTimer.svelte';

	/**
	 * Push-to-Talk Panel Component
	 *
	 * Small popover that appears near the button during recording.
	 * Shows audio visualization and timer without blocking interaction.
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

<div class="push-to-talk-popover">
	<div class="popover-content">
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
		<p class="hint-text">Release to send</p>
	</div>
</div>

<style>
	.push-to-talk-popover {
		position: absolute;
		bottom: calc(100% + 12px); /* Position above the button */
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		pointer-events: none; /* Don't intercept pointer events */
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}

	.popover-content {
		background: white;
		border-radius: 12px;
		padding: 16px;
		min-width: 200px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		border: 1px solid rgba(0, 0, 0, 0.1);
	}

	.hint-text {
		margin: 0;
		font-size: 12px;
		color: #666;
		text-align: center;
		white-space: nowrap;
	}

	/* Dark mode */
	@media (prefers-color-scheme: dark) {
		.popover-content {
			background: #2a2a2a;
			border-color: rgba(255, 255, 255, 0.1);
		}

		.hint-text {
			color: #999;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.push-to-talk-popover {
			animation: none;
		}
	}
</style>
