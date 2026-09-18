import { it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { audioPlayerReducer, createInitialAudioPlayerState } from '@composable-svelte/media';

const store = createTestStore({
  initialState: createInitialAudioPlayerState({
    tracks: [
      { id: '1', title: 'Test', src: '/test.mp3' }
    ]
  }),
  reducer: audioPlayerReducer,
  dependencies: {}
});

await store.send({ type: 'play' }, (state) => {
  expect(state.isPlaying).toBe(true);
});

await store.send({ type: 'nextTrack' }, (state) => {
  expect(state.currentTrackIndex).toBe(0); // Wraps around with 1 track
});
