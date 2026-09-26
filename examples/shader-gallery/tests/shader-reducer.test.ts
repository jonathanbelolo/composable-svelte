import { describe, it, expect } from 'vitest';
import { createInitialShaderGalleryState, shaderGalleryReducer } from '../src/lib/shader-reducer';
import { createStore } from '@composable-svelte/core';

describe('shaderGalleryReducer', () => {
  it('initializes with default pure state', () => {
    const state = createInitialShaderGalleryState();
    expect(state.shaderEffect).toBe('wave');
    expect(state.images.size).toBe(0);
  });

  it('registers image purely with id and src without DOM access (B031-2)', () => {
    const state = createInitialShaderGalleryState();
    const [nextState] = shaderGalleryReducer(
      state,
      { type: 'registerImage', id: 'img-1', src: 'https://example.com/photo.jpg' },
      {}
    );

    expect(nextState.images.size).toBe(1);
    expect(nextState.images.get('img-1')).toEqual({
      id: 'img-1',
      src: 'https://example.com/photo.jpg'
    });
  });

  it('unregisters images from state', () => {
    const state = createInitialShaderGalleryState();
    const [registered] = shaderGalleryReducer(
      state,
      { type: 'registerImage', id: 'img-1', src: 'https://example.com/photo.jpg' },
      {}
    );
    const [unregistered] = shaderGalleryReducer(registered, { type: 'unregisterImage', id: 'img-1' }, {});
    expect(unregistered.images.size).toBe(0);
  });

  it('integrates with Composable Architecture store', () => {
    const store = createStore({
      initialState: createInitialShaderGalleryState(),
      reducer: shaderGalleryReducer,
      dependencies: {}
    });

    store.dispatch({ type: 'setShaderEffect', effect: 'pixelate' });
    expect(store.state.shaderEffect).toBe('pixelate');
    store.destroy();
  });
});
