<script lang="ts">
	import FullAudioPlayer from '../../src/lib/audio-player/FullAudioPlayer.svelte';
	import VoiceInput from '../../src/lib/voice-input/VoiceInput.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { AudioPlayerState, AudioPlayerAction } from '../../src/lib/audio-player/types.js';
	import type { VoiceInputState, VoiceInputAction } from '../../src/lib/voice-input/types.js';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 */
	let {
		audioStore,
		voiceStore,
		class: className,
		showExpandButton,
		id,
		variant,
		label,
		disabled,
		onTranscript
	}: {
		audioStore: Store<AudioPlayerState, AudioPlayerAction>;
		voiceStore: Store<VoiceInputState, VoiceInputAction>;
		class?: string;
		showExpandButton?: boolean;
		id?: string;
		variant?: 'icon' | 'button' | 'fab';
		label?: string;
		disabled?: boolean;
		// Required by `<VoiceInput>`, so passed rather than forwarded — this
		// fixture is about the *optional* props.
		onTranscript: (text: string) => void;
	} = $props();
</script>

<FullAudioPlayer store={audioStore} class={className} {showExpandButton} {id} />
<VoiceInput store={voiceStore} class={className} {variant} {label} {disabled} {onTranscript} />
