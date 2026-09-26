<script lang="ts">
	import { untrack } from 'svelte';
	import type { VoiceInputState, VoiceInputAction } from './types.js';
	import VoiceInputButton from './components/VoiceInputButton.svelte';
	import VoiceInputPanel from './components/VoiceInputPanel.svelte';
	import { observeActions, type ViewStore } from '../internal/view-store.js';

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
		/** A standalone store, or the managed feature view (`FeatureViewProps.store`) */
		store: ViewStore<VoiceInputState, VoiceInputAction>;

		/**
		 * Called when transcription completes.
		 *
		 * Optional under managed composition: a transcript the application acts on
		 * belongs in the parent reducer, which sees the child's
		 * `transcriptionCompleted` action (see the package README).
		 */
		onTranscript?: ((transcript: string) => void) | undefined;

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

	// `undefined` once a managed view's owner retires. Its microphone, loops and
	// transcriptions were owner resources and are already released; the
	// component renders nothing and dispatches nothing.
	const voice: VoiceInputState | undefined = $derived($store);

	// Track transcript history for conversation mode
	let transcriptHistory = $state<string[]>([]);

	// Observe accepted transcripts for this component's own outputs: the
	// callback and the conversation panel's history. Keyed on the store alone:
	// the callback is read when a transcript arrives, so replacing it neither
	// drops nor repeats one, and a replaced store is never observed again.
	$effect(() => {
		const view = store;
		return untrack(() =>
			observeActions(
				view,
				(action) => {
					if (action.type !== 'transcriptionCompleted') return;
					onTranscript?.(action.transcript);
					if (view.state?.mode === 'conversation') {
						transcriptHistory = [...transcriptHistory, action.transcript];
					}
				},
				'VoiceInput'
			)
		);
	});

	// The microphone belongs to the store: the reducer's `voice-input-microphone`
	// resource acquires it and releases it through the injected
	// `deleteAudioManager`, whatever registry the store was configured with.
	// Unmounting releases it through that same path instead of reaching into a
	// registry itself — so an injected registry is honoured, a pending
	// permission request is cancelled and disposes a late grant, and the store
	// is left consistent. An utterance the user already finished is still
	// transcribed and reaches the store (`_releaseDevice`); `onTranscript`, which
	// belongs to this component, is unsubscribed above and does not fire. A
	// retired managed view (state `undefined`) has nothing left to release. A
	// replaced `store` is released the same way.
	$effect(() => {
		const view = store;
		return () =>
			untrack(() => {
				const state = view.state;
				if (state && (state._audioManagerId !== null || state.status === 'requesting-permission')) {
					view.dispatch({ type: '_releaseDevice' });
				}
			});
	});

	// Keyed on a `$derived` primitive for the same reason as the effect below:
	// reading `$store.mode` inside the effect subscribes to the whole store,
	// which `$state.raw` replaces on every dispatch, so this re-ran on every
	// action. Paired with a mode that briefly went null between utterances, that
	// re-dispatched `activateConversationMode` unboundedly — a new recorder and a
	// new level interval per utterance, and a runaway loop whenever activation
	// failed and reset the mode. The primitive's equality check absorbs the
	// dispatches that leave the mode alone. `undefined` after retirement, which
	// is not `null`, so a retired view is never activated.
	const activeMode = $derived(voice?.mode);

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
	const currentMode = $derived(voice?.mode);

	$effect(() => {
		// Referenced so the effect depends on the mode and nothing else; the reset
		// itself belongs in the teardown, which runs when the mode changes away.
		currentMode;
		return () => {
			transcriptHistory = [];
		};
	});
</script>

{#if voice}
<div class="voice-input {className}">
	<!-- Voice Input Button (stays on top during recording) -->
	<VoiceInputButton {store} {variant} {label} {disabled} isRecording={voice.status === 'recording'} />

	<!-- Voice Input Panel (appears when recording/active) -->
	{#if voice.status === 'recording' || voice.mode === 'conversation'}
		<VoiceInputPanel {store} transcripts={transcriptHistory} />
	{/if}

	<!--
		The reducer captures a reason on every failure path and nothing rendered it,
		so the user saw a tinted icon and never learned what went wrong. `role="alert"`
		because colour alone does not reach a screen reader, and this is the message a
		user needs in order to act on it.
	-->
	{#if voice.errorMessage}
		<div class="voice-input__error" role="alert">{voice.errorMessage}</div>
	{/if}
</div>
{/if}

<style>
	.voice-input {
		display: inline-block;
		position: relative;
	}

	.voice-input__error {
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		color: hsl(var(--destructive, 0 60% 50%));
	}
</style>
