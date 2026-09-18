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
