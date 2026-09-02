<script lang="ts">
	import { animateFadeIn } from '@composable-svelte/core/animation';
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

	let rootElement: HTMLDivElement | undefined = $state();

	// A plain `let`, never `$state`: a reactive guard would re-trigger the effect
	// it lives in. The popover is mounted by an `{#if}` in `VoiceInputPanel`, so
	// the entrance runs once per mount and nothing in the store sequences on it.
	// `animateFadeIn` reads `prefers-reduced-motion` and writes `opacity: 1`
	// under it, which is what lets this replace the CSS keyframe without
	// deleting the accessibility guard the keyframe needed.
	let hasEntered = false;

	$effect(() => {
		if (hasEntered || !rootElement) return;
		hasEntered = true;
		animateFadeIn(rootElement);
	});

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

<div class="push-to-talk-popover" bind:this={rootElement}>
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
	}

	.popover-content {
		background: hsl(var(--background, 0 0% 100%));
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
		color: hsl(var(--muted-foreground, 0 0% 40%));
		text-align: center;
		white-space: nowrap;
	}

	/* Dark mode */
	@media (prefers-color-scheme: dark) {
		.popover-content {
			background: hsl(var(--card, 0 0% 16.5%));
			border-color: rgba(255, 255, 255, 0.1);
		}

		.hint-text {
			color: hsl(var(--muted-foreground, 0 0% 60%));
		}
	}
</style>
