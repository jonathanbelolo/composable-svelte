<script lang="ts">
	import { untrack } from 'svelte';
	import FullAudioPlayer from '../../src/lib/audio-player/FullAudioPlayer.svelte';
	import type { ViewStore } from '../../src/lib/internal/view-store.js';
	import type { AudioPlayerAction, AudioPlayerState } from '../../src/lib/audio-player/types.js';

	type PlayerStore = ViewStore<AudioPlayerState, AudioPlayerAction>;
	let { store: initial }: { store: PlayerStore } = $props();
	// Deliberately not keyed: one component instance sees its `store` prop change.
	let store = $state.raw<PlayerStore>(untrack(() => initial));
	export function rebind(next: PlayerStore) {
		store = next;
	}
</script>

<FullAudioPlayer {store} />
