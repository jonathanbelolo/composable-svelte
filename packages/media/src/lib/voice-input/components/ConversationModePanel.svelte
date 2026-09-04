<script lang="ts">
	import { animateFadeIn } from '@composable-svelte/core/animation';
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from '../types.js';
	import AudioVisualizer from './AudioVisualizer.svelte';

	/**
	 * Conversation Mode Panel Component
	 *
	 * Displays conversation mode UI with VAD indicator, transcript history,
	 * and controls for manual send/stop.
	 */
	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
		transcripts?: string[] | undefined; // History of transcripts in this conversation
	/**
	 * Which heading element to render.
	 *
	 * The level belongs to the page, not to the component: put this under an
	 * `<h2>` and a fixed `<h3>` jumps the outline, which no consumer can fix from
	 * the outside. Defaults to the level it has always rendered.
	 */
		headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
	}

	const { store, transcripts = [], headingLevel = 3 }: Props = $props();

	let rootElement: HTMLDivElement | undefined = $state();

	// A plain `let`, never `$state`: a reactive guard would re-trigger the effect
	// it lives in. The panel is mounted by an `{#if}` in `VoiceInputPanel`, so the
	// entrance runs once per mount and nothing in the store sequences on it.
	// `animateFadeIn` reads `prefers-reduced-motion` and writes `opacity: 1`
	// under it, which is what lets this replace the CSS keyframe without deleting
	// the accessibility guard the keyframe needed.
	let hasEntered = false;

	$effect(() => {
		if (hasEntered || !rootElement) return;
		hasEntered = true;
		animateFadeIn(rootElement);
	});

	// Derived states
	const isSpeaking = $derived($store.vadState?.isSpeaking ?? false);
	const silenceDuration = $derived($store.vadState?.silenceDuration ?? 0);
	const threshold = $derived($store.vadState?.autoSendThreshold ?? 1500);
	const silenceProgress = $derived(silenceDuration / threshold);
	const isProcessing = $derived($store.status === 'processing');

	function handleManualSend() {
		store.dispatch({ type: 'manualSendRequested' });
	}

	function handleStop() {
		store.dispatch({ type: 'conversationModeToggled', enabled: false });
	}

	// Handle escape key
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleStop();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="conversation-panel" bind:this={rootElement}>
	<div class="panel-content">
		<!-- Header -->
		<div class="panel-header">
			<svelte:element this={`h${headingLevel}`} class="panel-title">Conversation Mode</svelte:element>
			<button class="stop-button" onclick={handleStop}>Stop</button>
		</div>

		<!-- Audio Visualizer -->
		<div class="visualizer-container">
			<AudioVisualizer audioLevel={$store.audioLevel} variant="bars" />
		</div>

		<!-- VAD Indicator -->
		<div class="vad-indicator" class:speaking={isSpeaking}>
			{#if isProcessing}
				<span class="status-dot processing"></span>
				<span class="status-text">Transcribing...</span>
			{:else if isSpeaking}
				<span class="status-dot active"></span>
				<span class="status-text">Speaking...</span>
			{:else}
				<span class="status-dot"></span>
				<span class="status-text">Listening...</span>
			{/if}
		</div>

		<!-- Silence Progress Bar (shown when not speaking) -->
		{#if !isSpeaking && !isProcessing && silenceDuration > 0}
			<div class="silence-progress">
				<div class="progress-bar">
					<div class="progress-fill" style="width: {silenceProgress * 100}%"></div>
				</div>
				<span class="progress-text">Auto-send in {Math.ceil((threshold - silenceDuration) / 1000)}s</span>
			</div>
		{/if}

		<!-- Transcript History -->
		{#if transcripts.length > 0}
			<div class="transcript-history">
				<div class="history-label">History:</div>
				<div class="history-items">
					{#each transcripts as transcript, i}
						<div class="history-item">
							<span class="item-number">{i + 1}.</span>
							<span class="item-text">{transcript}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="panel-actions">
			<button class="send-button" onclick={handleManualSend} disabled={isProcessing || !isSpeaking}>
				Send Now
			</button>
			<span class="hint-text">ESC to stop</span>
		</div>
	</div>
</div>

<style>
	.conversation-panel {
		position: absolute;
		bottom: calc(100% + 12px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		pointer-events: auto;
		min-width: 320px;
		max-width: 480px;
	}

	.panel-content {
		background: hsl(var(--background, 0 0% 100%));
		border-radius: 16px;
		padding: 20px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
		display: flex;
		flex-direction: column;
		gap: 16px;
		border: 1px solid rgba(0, 0, 0, 0.1);
		max-height: 60vh;
		overflow-y: auto;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.panel-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: hsl(var(--foreground, 0 0% 10.2%));
	}

	.stop-button {
		padding: 6px 12px;
		border: 1px solid hsl(var(--border, 0 0% 87.8%));
		background: hsl(var(--background, 0 0% 100%));
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--muted-foreground, 0 0% 40%));
		cursor: pointer;
	}

	.stop-button:hover {
		background: #fee;
		border-color: #fcc;
		color: hsl(var(--destructive, 0 60% 50%));
	}

	.visualizer-container {
		display: flex;
		justify-content: center;
		padding: 8px 0;
	}

	.vad-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.03);
		border-radius: 8px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: hsl(var(--muted, 0 0% 80%));
	}

	.status-dot.active {
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
		animation: pulse 2s ease-in-out infinite;
	}

	.status-dot.processing {
		background: hsl(var(--primary, 217.2 91.2% 59.8%));
		animation: spin 1s linear infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.7; }
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.status-text {
		font-size: 14px;
		color: hsl(var(--muted-foreground, 0 0% 40%));
		font-weight: 500;
	}

	.silence-progress {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.progress-bar {
		height: 4px;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 2px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: hsl(var(--primary, 217.2 91.2% 59.8%));
		transition: width 0.1s linear;
	}

	.progress-text {
		font-size: 11px;
		color: hsl(var(--muted-foreground, 0 0% 60%));
		text-align: center;
	}

	.transcript-history {
		padding: 12px;
		background: rgba(0, 0, 0, 0.02);
		border-radius: 8px;
		max-height: 200px;
		overflow-y: auto;
	}

	.history-label {
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--muted-foreground, 0 0% 40%));
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 8px;
	}

	.history-items {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.history-item {
		display: flex;
		gap: 8px;
		font-size: 13px;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 0 0% 40%));
	}

	.item-number {
		font-weight: 600;
		color: hsl(var(--muted-foreground, 0 0% 60%));
		flex-shrink: 0;
	}

	.item-text {
		color: hsl(var(--foreground, 0 0% 10.2%));
	}

	.panel-actions {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 8px;
		border-top: 1px solid rgba(0, 0, 0, 0.05);
	}

	.send-button {
		padding: 8px 16px;
		background: hsl(var(--primary, 217.2 91.2% 59.8%));
		color: hsl(var(--primary-foreground, 0 0% 100%));
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
	}

	.send-button:hover:not(:disabled) {
		background: hsl(var(--primary, 221.2 83.2% 53.3%));
	}

	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hint-text {
		font-size: 12px;
		color: hsl(var(--muted-foreground, 0 0% 60%));
	}

	/* Dark mode */
	@media (prefers-color-scheme: dark) {
		.panel-content {
			background: hsl(var(--card, 0 0% 16.5%));
			border-color: rgba(255, 255, 255, 0.1);
		}

		.panel-title {
			color: hsl(var(--foreground, 0 0% 87.8%));
		}

		.stop-button {
			background: hsl(var(--muted, 0 0% 20%));
			border-color: hsl(var(--border, 0 0% 26.7%));
			color: hsl(var(--foreground, 0 0% 80%));
		}

		.stop-button:hover {
			background: hsl(var(--destructive, 0 100% 13.3%));
			border-color: hsl(var(--destructive, 0 100% 20%));
			color: #fcc;
		}

		.vad-indicator {
			background: rgba(255, 255, 255, 0.05);
		}

		.status-text {
			color: hsl(var(--muted-foreground, 0 0% 66.7%));
		}

		.item-text {
			color: hsl(var(--foreground, 0 0% 87.8%));
		}

		.transcript-history {
			background: rgba(255, 255, 255, 0.02);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		/* The panel's own entrance is Motion One's now, and `animateFadeIn`
		   consults this preference itself. These two remain: they are legal
		   `infinite` animations, and this block is the only thing that stops
		   them. */
		.status-dot.active,
		.status-dot.processing {
			animation: none;
		}
	}
</style>
