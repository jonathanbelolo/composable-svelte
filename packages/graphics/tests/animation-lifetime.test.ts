/**
 * `tick` edge cases, and what happens to an animation whose target is gone.
 *
 * `tick` runs once per frame and writes straight into the mesh list the
 * renderer diffs, so anything it gets wrong is wrong sixty times a second.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import type { GraphicsAction, GraphicsState, MeshConfig } from '../src/core/types';

afterEach(() => vi.restoreAllMocks());

const makeStore = () =>
	createStore<GraphicsState, GraphicsAction>({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});

const cube = (over: Partial<MeshConfig> = {}): MeshConfig => ({
	id: 'cube',
	geometry: { type: 'box', size: 1 },
	position: [0, 0, 0],
	material: { color: '#ff0000' },
	...over
});

function animated(duration = 1000) {
	const store = makeStore();
	store.dispatch({ type: 'addMesh', mesh: cube() });
	store.dispatch({
		type: 'startAnimation',
		animation: {
			id: 'spin',
			targetId: 'cube',
			property: 'position',
			from: [0, 0, 0],
			to: [10, 0, 0],
			duration
		}
	});
	return { store, start: store.state.animations[0]!.startTime };
}

describe('tick keeps progress inside the animation', () => {
	it('completes a zero-duration animation instead of producing NaN', () => {
		// `elapsed / duration` is `0 / 0` when a tick lands in the same
		// millisecond as the start — both come from `Date.now()`, so this is
		// ordinary, not exotic. NaN then flows into the position, and
		// `progress >= 1` is false for NaN, so the animation never stops.
		const { store, start } = animated(0);

		store.dispatch({ type: 'tick', time: start });

		expect(store.state.meshes[0]!.position.every(Number.isFinite)).toBe(true);
		expect(store.state.meshes[0]!.position).toEqual([10, 0, 0]);
		expect(store.state.animations[0]!.isPlaying, 'it never finished').toBe(false);
	});

	it('does not extrapolate past the start of the animation', () => {
		// `Math.min(…, 1)` clamps the top and nothing clamped the bottom, so a
		// tick timestamped before `startTime` ran the animation backwards out of
		// its own range.
		const { store, start } = animated();

		store.dispatch({ type: 'tick', time: start - 500 });

		expect(store.state.meshes[0]!.position[0]).toBeGreaterThanOrEqual(0);
	});
});

describe('an animation does not outlive its target', () => {
	it('stops when the mesh it animates is removed', () => {
		const { store } = animated();

		store.dispatch({ type: 'removeMesh', id: 'cube' });

		// `startAnimation` checks the target exists; nothing rechecked after.
		// With `loop: true` this is an endless rAF chain allocating a fresh
		// mesh array every frame for a mesh that is not there.
		expect(store.state.animations).toHaveLength(0);
	});

	it('stops when the scene is cleared', () => {
		const { store } = animated();

		store.dispatch({ type: 'clearScene' });

		expect(store.state.animations).toHaveLength(0);
	});
});

describe('tick does not manufacture work', () => {
	it('leaves the mesh list alone when the value has not moved', () => {
		// A `from === to` animation writes the same value every frame. The
		// `meshUpdates.size === 0` guard only catches "no animations at all", so
		// each frame still produced a fresh mesh array — and every one of those
		// reached the adapter, which rebuilt a material for it.
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube({ position: [1, 1, 1] }) });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'still',
				targetId: 'cube',
				property: 'position',
				from: [1, 1, 1],
				to: [1, 1, 1],
				duration: 1000
			}
		});
		const start = store.state.animations[0]!.startTime;

		const before = store.state.meshes;
		store.dispatch({ type: 'tick', time: start + 100 });

		expect(store.state.meshes, 'a frame that changed nothing rebuilt the list').toBe(before);
	});

	it('carries the overshoot into the next lap rather than dropping it', () => {
		// A loop resetting `startTime` to the tick's own time discards however
		// far past the boundary the frame landed — on a 100ms loop ticked every
		// 16ms that is a drift of a whole frame per lap.
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'loop',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 100,
				loop: true
			}
		});
		const start = store.state.animations[0]!.startTime;

		// 60ms past the end of the first lap.
		store.dispatch({ type: 'tick', time: start + 160 });

		expect(store.state.animations[0]!.startTime).toBe(start + 100);
	});
});
