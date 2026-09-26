import { describe, it, expect } from 'vitest';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import type { GraphicsAction, GraphicsState, MeshConfig } from '../src/core/types';

const boxMesh: MeshConfig = {
	id: 'target',
	geometry: { type: 'box', size: 1 },
	material: { color: '#ffffff' },
	position: [0, 0, 0]
};

function reduceActions(
	initial: GraphicsState,
	actions: GraphicsAction[]
): GraphicsState {
	return actions.reduce(
		(state, action) => graphicsReducer(state, action, {})[0],
		initial
	);
}

describe('clock purity and first-tick anchoring', () => {
	it('startAnimation sets startTime to null pending first tick', () => {
		const state = reduceActions(createInitialGraphicsState({ sceneId: 'scene-1' }), [
			{ type: 'addMesh', mesh: boxMesh },
			{
				type: 'startAnimation',
				animation: {
					id: 'anim-1',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 1000
				}
			}
		]);

		expect(state.animations).toHaveLength(1);
		expect(state.animations[0]!.startTime).toBeNull();
		expect(state.animations[0]!.isPlaying).toBe(true);
	});

	it('pure-reduction deterministic repeat/replay yields identical states', () => {
		const actions: GraphicsAction[] = [
			{ type: 'addMesh', mesh: boxMesh },
			{
				type: 'startAnimation',
				animation: {
					id: 'anim-1',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 1000
				}
			},
			{ type: 'tick', time: 1000 },
			{ type: 'tick', time: 1400 },
			{ type: 'tick', time: 2000 }
		];

		const run1 = reduceActions(createInitialGraphicsState({ sceneId: 'pure' }), actions);
		const run2 = reduceActions(createInitialGraphicsState({ sceneId: 'pure' }), actions);

		expect(run1).toEqual(run2);
		expect(run1.meshes[0]!.position).toEqual([10, 0, 0]);
		expect(run1.animations[0]!.startTime).toBe(1000);
		expect(run1.animations[0]!.isPlaying).toBe(false);
	});

	it('completes a zero duration animation on first tick and persists anchored time', () => {
		const state = reduceActions(createInitialGraphicsState({ sceneId: 'scene-1' }), [
			{ type: 'addMesh', mesh: boxMesh },
			{
				type: 'startAnimation',
				animation: {
					id: 'instant',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 0
				}
			},
			{ type: 'tick', time: 500 }
		]);

		expect(state.meshes[0]!.position).toEqual([10, 0, 0]);
		expect(state.animations[0]!.startTime).toBe(500);
		expect(state.animations[0]!.isPlaying).toBe(false);
	});

	it('restarts same ID before first tick cleanly replacing pending animation', () => {
		const state = reduceActions(createInitialGraphicsState({ sceneId: 'scene-1' }), [
			{ type: 'addMesh', mesh: boxMesh },
			{
				type: 'startAnimation',
				animation: {
					id: 'move',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [5, 0, 0],
					duration: 1000
				}
			},
			{
				type: 'startAnimation',
				animation: {
					id: 'move',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 1000
				}
			},
			{ type: 'tick', time: 1000 },
			{ type: 'tick', time: 1500 }
		]);

		expect(state.animations).toHaveLength(1);
		expect(state.animations[0]!.startTime).toBe(1000);
		expect(state.meshes[0]!.position[0]).toBeCloseTo(5);
	});

	it('stops an animation before first tick without error', () => {
		const state = reduceActions(createInitialGraphicsState({ sceneId: 'scene-1' }), [
			{ type: 'addMesh', mesh: boxMesh },
			{
				type: 'startAnimation',
				animation: {
					id: 'move',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 1000
				}
			},
			{ type: 'stopAnimation', id: 'move' },
			{ type: 'tick', time: 1000 }
		]);

		expect(state.animations).toHaveLength(0);
		expect(state.meshes[0]!.position).toEqual([0, 0, 0]);
	});

	it.each([0, -100])('preserves explicit legacy timestamp %s without reanchoring', startTime => {
		const base = createInitialGraphicsState({ sceneId: 'legacy' });
		const legacyState: GraphicsState = {
			...base,
			meshes: [boxMesh],
			animations: [
				{
					id: 'zero-time',
					config: {
						id: 'zero-time',
						targetId: 'target',
						property: 'position',
						from: [0, 0, 0],
						to: [10, 0, 0],
						duration: 1000
					},
					startTime,
					isPlaying: true
				}
			]
		};

		const next = reduceActions(legacyState, [{ type: 'tick', time: startTime + 500 }]);
		expect(next.animations[0]!.startTime).toBe(startTime);
		expect(next.meshes[0]!.position[0]).toBeCloseTo(5);
	});

	it('controls loop overshoot deterministically across successive frames', () => {
		const state = reduceActions(createInitialGraphicsState({ sceneId: 'loop' }), [
			{ type: 'addMesh', mesh: boxMesh },
			{
				type: 'startAnimation',
				animation: {
					id: 'looping',
					targetId: 'target',
					property: 'position',
					from: [0, 0, 0],
					to: [10, 0, 0],
					duration: 100,
					loop: true
				}
			},
			{ type: 'tick', time: 1000 },
			{ type: 'tick', time: 1160 },
			{ type: 'tick', time: 1220 },
			{ type: 'tick', time: 1230 }
		]);

		expect(state.animations[0]!.startTime).toBe(1200);
		expect(state.meshes[0]!.position[0]).toBeCloseTo(3);
	});
});
