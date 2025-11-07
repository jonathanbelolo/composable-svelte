<script lang="ts">
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
		transcripts?: string[]; // History of transcripts in this conversation
	}

	const { store, transcripts = [] }: Props = $props();

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

<div class="conversation-panel">
	<div class="panel-content">
		<!-- Header -->
		<div class="panel-header">
			<h3 class="panel-title">Conversation Mode</h3>
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

		<!-- Live Transcript -->
		{#if $store.liveTranscript}
			<div class="live-transcript">
				<div class="transcript-label">Current:</div>
				<div class="transcript-text">{$store.liveTranscript}</div>
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

	.panel-content {
		background: white;
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
		color: #1a1a1a;
	}

	.stop-button {
		padding: 6px 12px;
		border: 1px solid #e0e0e0;
		background: white;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #666;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.stop-button:hover {
		background: #fee;
		border-color: #fcc;
		color: #c33;
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
		background: #ccc;
		transition: all 0.2s ease;
	}

	.status-dot.active {
		background: #22c55e;
		box-shadow: 0 0 0 3px rgba(34, 197, 94, 0.2);
		animation: pulse 2s ease-in-out infinite;
	}

	.status-dot.processing {
		background: #3b82f6;
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
		color: #666;
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
		background: #3b82f6;
		transition: width 0.1s linear;
	}

	.progress-text {
		font-size: 11px;
		color: #999;
		text-align: center;
	}

	.live-transcript {
		padding: 12px;
		background: rgba(59, 130, 246, 0.05);
		border-left: 3px solid #3b82f6;
		border-radius: 4px;
	}

	.transcript-label {
		font-size: 11px;
		font-weight: 600;
		color: #3b82f6;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 4px;
	}

	.transcript-text {
		font-size: 14px;
		color: #1a1a1a;
		line-height: 1.5;
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
		color: #666;
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
		color: #666;
	}

	.item-number {
		font-weight: 600;
		color: #999;
		flex-shrink: 0;
	}

	.item-text {
		color: #1a1a1a;
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
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.send-button:hover:not(:disabled) {
		background: #2563eb;
	}

	.send-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hint-text {
		font-size: 12px;
		color: #999;
	}

	/* Dark mode */
	@media (prefers-color-scheme: dark) {
		.panel-content {
			background: #2a2a2a;
			border-color: rgba(255, 255, 255, 0.1);
		}

		.panel-title {
			color: #e0e0e0;
		}

		.stop-button {
			background: #333;
			border-color: #444;
			color: #ccc;
		}

		.stop-button:hover {
			background: #400;
			border-color: #600;
			color: #fcc;
		}

		.vad-indicator {
			background: rgba(255, 255, 255, 0.05);
		}

		.status-text {
			color: #aaa;
		}

		.transcript-text,
		.item-text {
			color: #e0e0e0;
		}

		.transcript-history {
			background: rgba(255, 255, 255, 0.02);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.conversation-panel {
			animation: none;
		}

		.status-dot.active,
		.status-dot.processing {
			animation: none;
		}
	}
</style>
