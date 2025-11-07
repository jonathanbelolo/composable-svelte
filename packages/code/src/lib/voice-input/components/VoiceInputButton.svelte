<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from '../types.js';

	/**
	 * Voice Input Button Component
	 *
	 * Trigger button for voice input. Handles press & hold for push-to-talk.
	 */
	interface Props {
		store: Store<VoiceInputState, VoiceInputAction>;
		variant?: 'icon' | 'button' | 'fab';
		label?: string;
		disabled?: boolean;
		class?: string;
	}

	const { store, variant = 'icon', label = 'Voice Input', disabled = false, class: className = '' }: Props = $props();

	// Handle pointer down (start recording)
	function handlePointerDown(e: PointerEvent) {
		if (disabled || $store.status === 'processing') return;

		e.preventDefault();
		store.dispatch({ type: 'startPushToTalkRecording' });
	}

	// Handle pointer up (stop recording)
	function handlePointerUp(e: PointerEvent) {
		if (disabled || $store.status !== 'recording') return;

		e.preventDefault();
		store.dispatch({ type: 'stopPushToTalkRecording' });
	}

	// Handle pointer cancel (cancel recording)
	function handlePointerCancel(e: PointerEvent) {
		if (disabled || $store.status !== 'recording') return;

		e.preventDefault();
		store.dispatch({ type: 'cancelPushToTalkRecording' });
	}

	// Determine button state classes
	const isRecording = $derived($store.status === 'recording');
	const isProcessing = $derived($store.status === 'processing');
	const hasError = $derived($store.status === 'error');
</script>

<button
	class="voice-input-button voice-input-button--{variant} {className}"
	class:voice-input-button--recording={isRecording}
	class:voice-input-button--processing={isProcessing}
	class:voice-input-button--error={hasError}
	onpointerdown={handlePointerDown}
	onpointerup={handlePointerUp}
	onpointercancel={handlePointerCancel}
	{disabled}
	aria-label={isRecording ? 'Recording, release to send' : label}
	aria-pressed={isRecording}
	title={isRecording ? 'Release to send' : 'Press and hold to record'}
>
	{#if isProcessing}
		<!-- Processing spinner -->
		<svg class="voice-icon voice-icon--spinner" width="24" height="24" viewBox="0 0 24 24" fill="none">
			<circle class="spinner-circle" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
		</svg>
	{:else if hasError}
		<!-- Error icon -->
		<svg class="voice-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
			<path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" stroke-width="2"/>
			<path d="M12 8V12M12 16H12.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
		</svg>
	{:else}
		<!-- Microphone icon -->
		<svg class="voice-icon" width="24" height="24" viewBox="0 0 24 24" fill="none">
			<path d="M12 1C13.66 1 15 2.34 15 4V12C15 13.66 13.66 15 12 15C10.34 15 9 13.66 9 12V4C9 2.34 10.34 1 12 1Z" stroke="currentColor" stroke-width="2"/>
			<path d="M19 10V12C19 15.866 15.866 19 12 19C8.13401 19 5 15.866 5 12V10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			<path d="M12 19V23M8 23H16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
		</svg>
	{/if}

	{#if variant === 'button' && !isRecording}
		<span class="button-label">{label}</span>
	{/if}
</button>

<style>
	.voice-input-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
		touch-action: none; /* Prevent scroll on mobile */
		transition:
			background 0.2s ease,
			transform 0.1s ease,
			color 0.2s ease;
		border: none;
		outline: none;
	}

	.voice-input-button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.voice-input-button:not(:disabled):active {
		transform: scale(0.95);
	}

	/* Icon variant */
	.voice-input-button--icon {
		background: rgba(0, 0, 0, 0.05);
		border-radius: 50%;
		width: 40px;
		height: 40px;
		padding: 0;
		color: #1a1a1a;
	}

	.voice-input-button--icon:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.1);
	}

	/* Button variant */
	.voice-input-button--button {
		background: #007aff;
		color: white;
		border-radius: 8px;
		padding: 8px 16px;
		font-size: 14px;
		font-weight: 600;
	}

	.voice-input-button--button:hover:not(:disabled) {
		background: #0066cc;
	}

	/* FAB variant */
	.voice-input-button--fab {
		background: #007aff;
		color: white;
		border-radius: 50%;
		width: 56px;
		height: 56px;
		padding: 0;
		box-shadow: 0 4px 12px rgba(0, 122, 255, 0.4);
	}

	.voice-input-button--fab:hover:not(:disabled) {
		background: #0066cc;
		box-shadow: 0 6px 16px rgba(0, 122, 255, 0.5);
	}

	/* Recording state */
	.voice-input-button--recording {
		background: #dc2626 !important;
		color: white !important;
		animation: pulse-recording 1.5s ease-in-out infinite;
	}

	@keyframes pulse-recording {
		0%,
		100% {
			box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7);
		}
		50% {
			box-shadow: 0 0 0 8px rgba(220, 38, 38, 0);
		}
	}

	/* Processing state */
	.voice-input-button--processing {
		background: rgba(0, 122, 255, 0.1);
		color: #007aff;
		cursor: wait;
	}

	/* Error state */
	.voice-input-button--error {
		background: rgba(220, 38, 38, 0.1);
		color: #dc2626;
	}

	/* Icon */
	.voice-icon {
		display: block;
		width: 24px;
		height: 24px;
	}

	.voice-icon--spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.spinner-circle {
		stroke-dasharray: 50;
		stroke-dashoffset: 25;
		opacity: 0.6;
	}

	.button-label {
		white-space: nowrap;
	}

	@media (prefers-reduced-motion: reduce) {
		.voice-input-button--recording {
			animation: none;
		}

		.voice-icon--spinner {
			animation: none;
		}
	}
</style>
