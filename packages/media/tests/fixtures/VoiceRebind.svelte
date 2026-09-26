<script lang="ts">
	import { untrack } from 'svelte';
	import VoiceInput from '../../src/lib/voice-input/VoiceInput.svelte';
	import type { ViewStore } from '../../src/lib/internal/view-store.js';
	import type { VoiceInputAction, VoiceInputState } from '../../src/lib/voice-input/types.js';

	type VoiceStore = ViewStore<VoiceInputState, VoiceInputAction>;
	let { store: initial, onTranscript }: { store: VoiceStore; onTranscript: (text: string) => void } = $props();
	// Deliberately not keyed: one component instance sees its `store` prop change.
	let store = $state.raw<VoiceStore>(untrack(() => initial));
	export function rebind(next: VoiceStore) {
		store = next;
	}
</script>

<VoiceInput {store} {onTranscript} />
