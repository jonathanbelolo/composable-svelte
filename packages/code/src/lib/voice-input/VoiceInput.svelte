<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import type { VoiceInputState, VoiceInputAction } from './types.js';
	import VoiceInputButton from './components/VoiceInputButton.svelte';
	import VoiceInputPanel from './components/VoiceInputPanel.svelte';
	import { deleteAudioManager } from './audio/audio-manager-registry.js';

	/**
	 * Voice Input Component
	 *
	 * Standalone, reusable voice input component with push-to-talk and conversation modes.
	 * Handles microphone access, audio recording, and transcription via backend API.
	 *
	 * @example
	 * ```svelte
	 * <VoiceInput
	 *   store={voiceStore}
	 *   onTranscript={(text) => handleTranscript(text)}
	 *   defaultMode="push-to-talk"
	 *   variant="icon"
	 * />
	 * ```
	 */
	interface Props {
		/** Voice input store (manages its own state) */
		store: Store<VoiceInputState, VoiceInputAction>;

		/** Called when transcription completes */
		onTranscript: (transcript: string) => void;

		/** Default mode on mount */
		defaultMode?: 'push-to-talk' | 'conversation';

		/** Optional: Custom button variant */
		variant?: 'icon' | 'button' | 'fab';

		/** Optional: Custom button text (for 'button' variant) */
		label?: string;

		/** Optional: Disable the input */
		disabled?: boolean;

		/** Optional: Custom CSS class */
		class?: string;
	}

	const {
		store,
		onTranscript,
		defaultMode = 'push-to-talk',
		variant = 'icon',
		label,
		disabled = false,
		class: className = ''
	}: Props = $props();

	// Subscribe to store actions to detect transcription completion
	$effect(() => {
		const unsubscribe = store.subscribeToActions?.((action) => {
			// When transcription completes, call the onTranscript callback
			if (action.type === 'transcriptionCompleted') {
				onTranscript(action.transcript);
			}
		});

		return () => {
			unsubscribe?.();
		};
	});

	// Cleanup audio manager when component unmounts
	$effect(() => {
		return () => {
			const audioManagerId = $store._audioManagerId;
			if (audioManagerId) {
				deleteAudioManager(audioManagerId);
			}
		};
	});

	// Only set default mode for conversation mode (push-to-talk doesn't need pre-activation)
	$effect(() => {
		if ($store.mode === null && defaultMode === 'conversation') {
			store.dispatch({ type: 'activateConversationMode' });
		}
	});
</script>

<div class="voice-input {className}">
	<!-- Voice Input Button (stays on top during recording) -->
	<VoiceInputButton {store} {variant} {label} {disabled} isRecording={$store.status === 'recording'} />

	<!-- Voice Input Panel (appears when recording/active) -->
	{#if $store.status === 'recording' || $store.mode === 'conversation'}
		<VoiceInputPanel {store} />
	{/if}
</div>

<style>
	.voice-input {
		display: inline-block;
		position: relative;
	}
</style>
