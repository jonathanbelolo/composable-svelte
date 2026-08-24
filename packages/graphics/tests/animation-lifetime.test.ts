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

describe('two animations on one property', () => {
	// Last-writer-wins is the documented behaviour here: `property` is one of
	// three, `tick` accumulates per mesh, and two animations on the same one
	// necessarily collide. What must not happen is the two alternating.

	it('does not alternate when one of them holds the mesh where it is', () => {
		// This is the shape that exposes it. The guard compares the interpolated
		// value against the mesh as it stands *before* the tick — so the animation
		// whose value equals that is skipped as a no-op, and the other one writes
		// instead. Next frame the roles swap. The mesh strobes at half the frame
		// rate: 1.9, 1, 3.7, 1, 5.5, 1.
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube({ position: [1, 1, 1] }) });

		for (const [id, to] of [['sweep', 10], ['hold', 1]] as const) {
			store.dispatch({
				type: 'startAnimation',
				animation: {
					id,
					targetId: 'cube',
					property: 'position',
					from: [1, 1, 1],
					to: [to, 1, 1],
					duration: 1000
				}
			});
		}

		const start = Math.max(...store.state.animations.map((a) => a.startTime));
		const seen: number[] = [];
		for (const offset of [100, 200, 300, 400, 500, 600]) {
			store.dispatch({ type: 'tick', time: start + offset });
			seen.push(store.state.meshes[0]!.position[0]);
		}

		// `hold` is dispatched last, so it wins every frame and the mesh does not
		// move at all.
		expect(new Set(seen), `position strobed: ${seen.join(' ')}`).toEqual(new Set([1]));
	});

	it('still lets the last one drive when both are moving', () => {
		// The paired half: the guard must not become a no-op. `near` is last, so
		// the mesh tracks it — 0.5, 1.0, 1.5 — rather than `far`'s curve.
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube({ position: [0, 0, 0] }) });

		for (const [id, to] of [['far', 10], ['near', 5]] as const) {
			store.dispatch({
				type: 'startAnimation',
				animation: {
					id,
					targetId: 'cube',
					property: 'position',
					from: [0, 0, 0],
					to: [to, 0, 0],
					duration: 1000
				}
			});
		}

		const start = Math.max(...store.state.animations.map((a) => a.startTime));
		store.dispatch({ type: 'tick', time: start + 600 });

		expect(store.state.meshes[0]!.position[0], 'the last writer did not win').toBeCloseTo(3);
	});
});

describe('animations are keyed by id, like meshes and lights', () => {
	it('a zero-duration loop does not spin forever', () => {
		// `duration <= 0` completes immediately, so looping it means completing
		// on every frame for ever — a rAF chain that can never produce a
		// different pixel. The non-looping case was fixed; this one still spun.
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'instant',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 0,
				loop: true
			}
		});
		const start = store.state.animations[0]!.startTime;

		store.dispatch({ type: 'tick', time: start });

		expect(store.state.meshes[0]!.position).toEqual([10, 0, 0]);
		expect(store.state.animations[0]!.isPlaying, 'it never stopped').toBe(false);
	});
});

describe('one animation frame loop, not one per animation', () => {
	/** Ticks dispatched in a fixed window with `count` animations running. */
	async function ticksFor(count: number): Promise<number> {
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });

		let ticks = 0;
		const unsubscribe = store.subscribeToActions?.((action) => {
			if (action.type === 'tick') ticks++;
		});

		for (let i = 0; i < count; i++) {
			store.dispatch({
				type: 'startAnimation',
				animation: {
					id: `anim-${i}`,
					targetId: 'cube',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 5000,
					loop: true
				}
			});
		}

		await new Promise((resolve) => setTimeout(resolve, 80));
		store.dispatch({ type: 'clearScene' });
		unsubscribe?.();
		return ticks;
	}

	it('runs at the same rate with five animations as with one', async () => {
		// `startAnimation` scheduled a rAF and every `tick` scheduled another
		// whenever any animation was playing, so the chains never merged. The
		// frame rate is the invariant, not the raw count — asserting a fixed
		// number would pin whatever speed jsdom happens to run rAF at.
		const one = await ticksFor(1);
		const five = await ticksFor(5);

		expect(one, 'no ticks at all — the loop never started').toBeGreaterThan(0);
		expect(
			five,
			`five animations produced ${five} ticks where one produced ${one}`
		).toBeLessThan(one * 2);
	});
});

describe('an animation id can be reused', () => {
	it('restarts an animation that has finished', () => {
		// The duplicate-id guard tested `animations.some(a => a.id === …)`, and
		// `tick` marks a finished animation `isPlaying: false` without removing
		// it — so a completed id was burned for the life of the store, and the
		// warning said "is already running" about something that was not.
		//
		// Straight out of the README: its `<button onclick={startRotation}>`
		// dispatches a fixed id, so without `loop: true` that button worked
		// exactly once, silently.
		const { store, start } = animated(100);
		store.dispatch({ type: 'tick', time: start + 200 });
		expect(store.state.animations[0]!.isPlaying).toBe(false);

		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'spin',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 100
			}
		});

		expect(store.state.animations, 'the id was duplicated rather than reused').toHaveLength(1);
		expect(store.state.animations[0]!.isPlaying, 'the restart was refused').toBe(true);
	});

	it('replaces a running animation rather than doubling it', () => {
		// The paired half: restarting must supersede, not accumulate. Two entries
		// under one id could only ever be stopped together.
		const { store } = animated();

		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'spin',
				targetId: 'cube',
				property: 'scale',
				from: [1, 1, 1],
				to: [2, 2, 2],
				duration: 500
			}
		});

		expect(store.state.animations).toHaveLength(1);
		expect(store.state.animations[0]!.config.property, 'the new config was dropped').toBe('scale');
	});
});

describe('the frame loop stays single through any sequence', () => {
	/**
	 * Count rAF callbacks that are still pending — a forked chain shows up as
	 * more than one, and a dead chain as zero.
	 */
	function pendingFrames(): { run: () => void; count: () => number } {
		const queued: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			queued.push(cb);
			return queued.length;
		});
		return {
			run: () => {
				const batch = queued.splice(0, queued.length);
				batch.forEach((cb) => cb(0));
			},
			count: () => queued.length
		};
	}

	const spin = (id: string) => ({
		id,
		targetId: 'cube',
		property: 'position' as const,
		from: [0, 0, 0] as [number, number, number],
		to: [10, 0, 0] as [number, number, number],
		duration: 5000,
		loop: true
	});

	it.each([
		['five started at once', ['start:a', 'start:b', 'start:c', 'start:d', 'start:e']],
		['stop then start again', ['start:a', 'stop:a', 'start:a']],
		['clearScene then start again', ['start:a', 'clear', 'mesh', 'start:a']],
		['removeMesh then start again', ['start:a', 'remove', 'mesh', 'start:a']]
	])('%s leaves one chain', async (_name, steps) => {
		// `alreadyTicking` was a proxy for "a frame is already pending", derived
		// from whether anything was playing — and those come apart the moment an
		// animation is removed while its frame is still in flight. Each of these
		// sequences forked a second chain that never merged and never died, and
		// they compounded: five start/stop cycles settled at six permanent
		// chains, each re-walking every animation and mesh for ever.
		const frames = pendingFrames();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });

		for (const step of steps) {
			const [op, id] = step.split(':');
			if (op === 'start') store.dispatch({ type: 'startAnimation', animation: spin(id!) });
			else if (op === 'stop') store.dispatch({ type: 'stopAnimation', id: id! });
			else if (op === 'clear') store.dispatch({ type: 'clearScene' });
			else if (op === 'remove') store.dispatch({ type: 'removeMesh', id: 'cube' });
			else if (op === 'mesh') store.dispatch({ type: 'addMesh', mesh: cube() });
			await Promise.resolve();
		}
		await Promise.resolve();

		// Counting *queued* callbacks would be the wrong measure: a superseded
		// chain's callback is still queued — rAF has no cancellation the store can
		// reach — it simply does not dispatch when it runs. What matters is how
		// many survive a generation, so run the batch and count what it queues.
		frames.run();
		await Promise.resolve();
		await Promise.resolve();
		expect(frames.count(), 'the frame chain forked or died').toBe(1);

		// And again, because a fork can take a generation to show.
		frames.run();
		await Promise.resolve();
		await Promise.resolve();
		expect(frames.count(), 'the frame chain forked or died on the second lap').toBe(1);

		vi.unstubAllGlobals();
	});
});