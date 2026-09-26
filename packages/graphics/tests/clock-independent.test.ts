import { afterEach, expect, it, vi } from 'vitest';
import { graphicsReducer } from '../src/core/reducer.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';
import type { GraphicsAction, GraphicsState } from '../src/core/types.js';

afterEach(() => vi.restoreAllMocks());

function initial(): GraphicsState {
  const [state] = graphicsReducer(createInitialGraphicsState(), {
    type: 'addMesh', mesh: { id: 'box', geometry: { type: 'box', size: 1 }, position: [0, 0, 0], material: { color: '#ffffff' } }
  }, {});
  return state;
}
const start: GraphicsAction = { type: 'startAnimation', animation: {
  id: 'move', targetId: 'box', property: 'position', from: [0, 0, 0], to: [10, 0, 0], duration: 100
} };

it('starting animation is deterministic even when the wall clock changes', () => {
  const state = initial();
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const [first] = graphicsReducer(state, start, {});
  clock.mockReturnValue(2000);
  const [second] = graphicsReducer(state, start, {});
  expect(second).toEqual(first);
  expect(clock).not.toHaveBeenCalled();
  expect(first.animations[0]!.startTime).toBeNull();
});

it('anchors at explicit zero and advances deterministically from recorded ticks', () => {
  let [state] = graphicsReducer(initial(), start, {});
  [state] = graphicsReducer(state, { type: 'tick', time: 0 }, {});
  expect(state.animations[0]!.startTime).toBe(0);
  expect(state.meshes[0]!.position).toEqual([0, 0, 0]);
  [state] = graphicsReducer(state, { type: 'tick', time: 50 }, {});
  expect(state.meshes[0]!.position).toEqual([5, 0, 0]);
  [state] = graphicsReducer(state, { type: 'tick', time: 100 }, {});
  expect(state.meshes[0]!.position).toEqual([10, 0, 0]);
  expect(state.animations[0]!.isPlaying).toBe(false);
});

it('retains a hydrated numeric start at zero instead of reanchoring it', () => {
  let [state] = graphicsReducer(initial(), start, {});
  state = { ...state, animations: state.animations.map(animation => ({ ...animation, startTime: 0 })) };
  [state] = graphicsReducer(state, { type: 'tick', time: 50 }, {});
  expect(state.animations[0]!.startTime).toBe(0);
  expect(state.meshes[0]!.position).toEqual([5, 0, 0]);
});
