/**
 * @file reducer.test.ts
 * @description Tests for graphics reducer
 */

import { describe, it, expect } from 'vitest';
import { TestStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import type { GraphicsState, GraphicsAction } from '../src/core/types';

describe('Graphics Reducer', () => {
  describe('Mesh Actions', () => {
    it('adds mesh to scene', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'addMesh',
          mesh: {
            id: 'cube-1',
            geometry: { type: 'box', size: 1 },
            material: { color: '#ff6b6b' },
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            visible: true
          }
        },
        (state) => {
          expect(state.meshes).toHaveLength(1);
          expect(state.meshes[0].id).toBe('cube-1');
          expect(state.meshes[0].geometry.type).toBe('box');
        }
      );
    });

    it('removes mesh from scene', async () => {
      const initialState = createInitialGraphicsState();
      initialState.meshes = [
        {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true
        }
      ];

      const store = new TestStore({
        initialState,
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send({ type: 'removeMesh', id: 'cube-1' }, (state) => {
        expect(state.meshes).toHaveLength(0);
      });
    });

    it('updates mesh position', async () => {
      const initialState = createInitialGraphicsState();
      initialState.meshes = [
        {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true
        }
      ];

      const store = new TestStore({
        initialState,
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'setMeshPosition',
          id: 'cube-1',
          position: [1, 2, 3]
        },
        (state) => {
          const cube = state.meshes.find((m) => m.id === 'cube-1');
          expect(cube?.position).toEqual([1, 2, 3]);
        }
      );
    });

    it('updates mesh rotation', async () => {
      const initialState = createInitialGraphicsState();
      initialState.meshes = [
        {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true
        }
      ];

      const store = new TestStore({
        initialState,
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'setMeshRotation',
          id: 'cube-1',
          rotation: [0, Math.PI / 2, 0]
        },
        (state) => {
          const cube = state.meshes.find((m) => m.id === 'cube-1');
          expect(cube?.rotation).toEqual([0, Math.PI / 2, 0]);
        }
      );
    });

    it('toggles mesh visibility', async () => {
      const initialState = createInitialGraphicsState();
      initialState.meshes = [
        {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true
        }
      ];

      const store = new TestStore({
        initialState,
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send({ type: 'toggleMeshVisibility', id: 'cube-1' }, (state) => {
        const cube = state.meshes.find((m) => m.id === 'cube-1');
        expect(cube?.visible).toBe(false);
      });

      await store.send({ type: 'toggleMeshVisibility', id: 'cube-1' }, (state) => {
        const cube = state.meshes.find((m) => m.id === 'cube-1');
        expect(cube?.visible).toBe(true);
      });
    });
  });

  describe('Camera Actions', () => {
    it('updates camera position', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'setCameraPosition',
          position: [5, 5, 5]
        },
        (state) => {
          expect(state.camera.position).toEqual([5, 5, 5]);
        }
      );
    });

    it('updates camera lookAt', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'setCameraLookAt',
          lookAt: [1, 1, 1]
        },
        (state) => {
          expect(state.camera.lookAt).toEqual([1, 1, 1]);
        }
      );
    });
  });

  describe('Light Actions', () => {
    it('adds directional light', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'addLight',
          light: {
            type: 'directional',
            position: [1, 1, 1],
            intensity: 0.8,
            color: '#ffffff'
          }
        },
        (state) => {
          expect(state.lights).toHaveLength(2); // Initial ambient + new directional
          const directional = state.lights[1];
          expect(directional.type).toBe('directional');
          expect(directional.intensity).toBe(0.8);
        }
      );
    });

    it('removes light', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send({ type: 'removeLight', index: 0 }, (state) => {
        expect(state.lights).toHaveLength(0);
      });
    });
  });

  describe('Scene Actions', () => {
    it('sets background color', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'setBackgroundColor',
          color: '#ff0000'
        },
        (state) => {
          expect(state.backgroundColor).toBe('#ff0000');
        }
      );
    });

    it('clears scene', async () => {
      const initialState = createInitialGraphicsState();
      initialState.meshes = [
        {
          id: 'cube-1',
          geometry: { type: 'box', size: 1 },
          material: { color: '#ff6b6b' },
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          visible: true
        }
      ];
      initialState.lights = [
        { type: 'directional', position: [1, 1, 1], intensity: 1, color: '#ffffff' }
      ];

      const store = new TestStore({
        initialState,
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send({ type: 'clearScene' }, (state) => {
        expect(state.meshes).toHaveLength(0);
        expect(state.lights).toHaveLength(0);
        expect(state.animations).toHaveLength(0);
      });
    });
  });

  describe('Renderer Actions', () => {
    it('handles renderer initialization', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'rendererInitialized',
          renderer: 'webgpu',
          capabilities: {
            supportsWebGPU: true,
            supportsWebGL: true,
            maxTextureSize: 16384,
            maxVertexAttributes: 16
          }
        },
        (state) => {
          expect(state.renderer.activeRenderer).toBe('webgpu');
          expect(state.renderer.isInitialized).toBe(true);
          expect(state.renderer.error).toBe(null);
          expect(state.isLoading).toBe(false);
        }
      );
    });

    it('handles renderer error', async () => {
      const store = new TestStore({
        initialState: createInitialGraphicsState(),
        reducer: graphicsReducer,
        dependencies: {}
      });

      await store.send(
        {
          type: 'rendererError',
          error: 'WebGPU not supported'
        },
        (state) => {
          expect(state.renderer.error).toBe('WebGPU not supported');
          expect(state.isLoading).toBe(false);
        }
      );
    });
  });
});
