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
		defaultMode?: 'push-to-talk' | 'conversation' | undefined;

		/** Optional: Custom button variant */
		variant?: 'icon' | 'button' | 'fab' | undefined;

		/** Optional: Custom button text (for 'button' variant) */
		label?: string | undefined;

		/** Optional: Disable the input */
		disabled?: boolean | undefined;

		/** Optional: Custom CSS class */
		class?: string | undefined;
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

	// Track transcript history for conversation mode
	let transcriptHistory = $state<string[]>([]);

	// Subscribe to store actions to detect transcription completion
	$effect(() => {
		const unsubscribe = store.subscribeToActions?.((action) => {
			// When transcription completes, call the onTranscript callback
			if (action.type === 'transcriptionCompleted') {
				onTranscript(action.transcript);

				// Add to history if in conversation mode
				if ($store.mode === 'conversation') {
					transcriptHistory = [...transcriptHistory, action.transcript];
				}
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

	// Keyed on a `$derived` primitive for the same reason as the effect below:
	// reading `$store.mode` inside the effect subscribes to the whole store,
	// which `$state.raw` replaces on every dispatch, so this re-ran on every
	// action. Paired with a mode that briefly went null between utterances, that
	// re-dispatched `activateConversationMode` unboundedly — a new recorder and a
	// new level interval per utterance, and a runaway loop whenever activation
	// failed and reset the mode. The primitive's equality check absorbs the
	// dispatches that leave the mode alone.
	const activeMode = $derived($store.mode);

	$effect(() => {
		if (activeMode === null && defaultMode === 'conversation') {
			store.dispatch({ type: 'activateConversationMode' });
		}
	});

	// Reset transcript history when mode changes.
	//
	// Keyed on a `$derived` primitive, not on `$store`. Reading `$store.mode`
	// inside the effect tracks the whole-store subscription, which `$state.raw`
	// replaces on every dispatch — so every action re-ran this effect and every
	// re-run fired the teardown first. While recording, `audioLevelUpdated`
	// arrives per animation frame, so the history was wiped continuously and the
	// conversation panel was permanently empty. A primitive's equality check
	// absorbs the dispatches that leave the mode alone.
	const currentMode = $derived($store.mode);

	$effect(() => {
		// Referenced so the effect depends on the mode and nothing else; the reset
		// itself belongs in the teardown, which runs when the mode changes away.
		currentMode;
		return () => {
			transcriptHistory = [];
		};
	});
</script>

<div class="voice-input {className}">
	<!-- Voice Input Button (stays on top during recording) -->
	<VoiceInputButton {store} {variant} {label} {disabled} isRecording={$store.status === 'recording'} />

	<!-- Voice Input Panel (appears when recording/active) -->
	{#if $store.status === 'recording' || $store.mode === 'conversation'}
		<VoiceInputPanel {store} transcripts={transcriptHistory} />
	{/if}

	<!--
		The reducer captures a reason on every failure path and nothing rendered it,
		so the user saw a tinted icon and never learned what went wrong. `role="alert"`
		because colour alone does not reach a screen reader, and this is the message a
		user needs in order to act on it.
	-->
	{#if $store.errorMessage}
		<div class="voice-input__error" role="alert">{$store.errorMessage}</div>
	{/if}
</div>

<style>
	.voice-input {
		display: inline-block;
		position: relative;
	}

	.voice-input__error {
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		color: #c33;
	}
</style>
