<!--
	Mirrors: packages/media/README.md

	The AudioPlayer quickstart. What it replaced was fabricated in four ways at
	once, and every one of them typechecks as prose:

	  - `createInitialAudioPlayerState({ tracks })` — the factory takes playback
	    *preferences* only (`volume`, `playbackSpeed`, `loopMode`, `isShuffled`).
	    `tracks` was an excess property, so the playlist stayed empty.
	  - `AudioTrack.src` — the field is `url`.
	  - the playlist arrives by action, not by construction: `loadPlaylist`.
	  - the action was named `tracks`, not `playlist`.

	As a file, `svelte-check` typechecks it under `pnpm -r check`, and the arm in
	`doc-examples.test.ts` asserts the README still quotes it verbatim.
-->
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    MinimalAudioPlayer,
    audioPlayerReducer,
    createInitialAudioPlayerState,
    type AudioTrack
  } from '@composable-svelte/media';

  const tracks: AudioTrack[] = [
    { id: '1', title: 'Track One', url: '/audio/track1.mp3' },
    { id: '2', title: 'Track Two', url: '/audio/track2.mp3' }
  ];

  const store = createStore({
    initialState: createInitialAudioPlayerState({ volume: 0.8 }),
    reducer: audioPlayerReducer,
    dependencies: {}
  });

  // The factory takes preferences; the playlist arrives as an action.
  store.dispatch({ type: 'loadPlaylist', tracks });
</script>

<MinimalAudioPlayer {store} />
