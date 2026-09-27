/**
 * The retained renderer's visual continuation of declared animations must
 * produce what the actual `graphicsReducer` would have — poses *and* lifecycle
 * — at the same sequential timestamps (review G2). The reducer is the oracle:
 * each case ticks a real store state and a continuation from the same data
 * snapshot, and compares every animated property after every tick.
 */

import { describe, it, expect } from 'vitest';
import { continueAnimations } from '../../src/core/animation-sample.js';
import { graphicsReducer } from '../../src/core/reducer.js';
import { createInitialGraphicsState } from '../../src/core/initial-state.js';
import type {
	AnimationConfig,
	AnimationState,
	GraphicsState,
	MeshConfig,
	Vector3
} from '../../src/core/types.js';

type Property = 'position' | 'rotation' | 'scale';
const PROPERTIES: readonly Property[] = ['position', 'rotation', 'scale'];

const mesh = (id: string, extra: Partial<MeshConfig> = {}): MeshConfig => ({
	id,
	geometry: { type: 'box', size: 1 },
	material: { color: '#ff0000' },
	position: [0, 0, 0],
	...extra
});

const track = (
	config: Partial<AnimationConfig> & Pick<AnimationConfig, 'id' | 'to' | 'duration'>,
	startTime: number | null = 0
): AnimationState => ({
	id: config.id,
	isPlaying: true,
	startTime,
	config: {
		targetId: 'cube',
		property: 'position',
		from: [0, 0, 0],
		easing: 'linear',
		...config
	}
});

/** A renderer that records the poses it is given, per mesh and property. */
function recorder(meshes: readonly MeshConfig[]) {
	const poses = new Map<string, Partial<Record<Property, Vector3>>>();
	for (const m of meshes) {
		const pose: Partial<Record<Property, Vector3>> = { position: m.position };
		if (m.rotation) pose.rotation = m.rotation;
		if (m.scale) pose.scale = m.scale;
		poses.set(m.id, pose);
	}
	let writes = 0;
	return {
		poses,
		writes: () => writes,
		adapter: {
			updateMesh(id: string, update: Partial<MeshConfig>) {
				writes++;
				const pose = poses.get(id) ?? {};
				for (const property of PROPERTIES) if (update[property]) pose[property] = update[property];
				poses.set(id, pose);
			}
		}
	};
}

/**
 * Tick the reducer and the continuation at each time; compare every animated
 * property of every mesh, and the reducer's lifecycle with the continuation's
 * writes.
 */
function compare(
	animations: AnimationState[],
	meshes: MeshConfig[],
	times: number[],
	options: { snapshot?: boolean } = {}
) {
	let state: GraphicsState = { ...createInitialGraphicsState(), animations, meshes };
	let time = 0;
	const rec = recorder(meshes);
	const advance = continueAnimations(
		animations,
		rec.adapter as never,
		() => time,
		options.snapshot === false ? undefined : meshes
	);
	expect(advance).toBeDefined();
	const trace: Array<{ time: number; playing: number; writes: number }> = [];
	for (time of times) {
		[state] = graphicsReducer(state, { type: 'tick', time }, {});
		advance!();
		for (const m of state.meshes) {
			for (const property of PROPERTIES) {
				if (!animations.some((a) => a.config.targetId === m.id && a.config.property === property)) continue;
				expect(rec.poses.get(m.id)?.[property], `${m.id}.${property} at ${time}`).toEqual(m[property]);
			}
		}
		trace.push({ time, playing: state.animations.filter((a) => a.isPlaying).length, writes: rec.writes() });
	}
	return { state, trace, rec };
}

describe('continueAnimations follows the actual reducer', () => {
	it('crosses loop laps as the reducer does: endpoint on the crossing frame, overshoot carried', () => {
		compare(
			[track({ id: 'loop', to: [10, 0, 0], duration: 100, loop: true })],
			[mesh('cube')],
			[90, 110, 120, 199, 205, 299, 300, 310, 655, 700]
		);
	});

	it('completes a non-looping animation with its terminal pose once, then writes nothing', () => {
		const { trace } = compare(
			[track({ id: 'once', to: [10, 0, 0], duration: 100, easing: 'easeInOut' })],
			[mesh('cube')],
			[30, 60, 130, 200, 400]
		);
		const completed = trace.findIndex((entry) => entry.playing === 0);
		expect(completed).toBe(2);
		expect(trace.at(-1)!.writes, 'wrote after completion').toBe(trace[completed]!.writes);
	});

	it('stops a completed overlapping track overriding the one still playing', () => {
		compare(
			[
				track({ id: 'long', to: [100, 0, 0], duration: 1000 }),
				track({ id: 'short', to: [10, 0, 0], duration: 100 })
			],
			[mesh('cube')],
			[50, 100, 200, 500, 1000, 1100]
		);
	});

	it('keeps last-writer-wins across overlapping looping tracks on one property', () => {
		compare(
			[
				track({ id: 'a', to: [4, 0, 0], duration: 70, loop: true }),
				track({ id: 'b', to: [0, 9, 0], duration: 130, loop: true, easing: 'easeOut' })
			],
			[mesh('cube')],
			[20, 69, 71, 129, 131, 260, 333]
		);
	});

	it('animates several properties and meshes, anchoring never-ticked tracks on their first frame', () => {
		compare(
			[
				track({ id: 'spin', property: 'rotation', to: [0, Math.PI * 2, 0], duration: 90, loop: true }),
				track({ id: 'grow', property: 'scale', from: [1, 1, 1], to: [2, 2, 2], duration: 60, easing: 'easeIn' }, null),
				track({ id: 'slide', targetId: 'other', to: [0, 0, 5], duration: 50 }, 40)
			],
			[mesh('cube', { rotation: [0, 0, 0], scale: [1, 1, 1] }), mesh('other')],
			[10, 45, 70, 95, 120, 181]
		);
	});

	it('matches without a mesh snapshot as well (poses, not write counts)', () => {
		compare(
			[
				track({ id: 'long', to: [100, 0, 0], duration: 1000 }),
				track({ id: 'short', to: [10, 0, 0], duration: 100, loop: true })
			],
			[mesh('cube')],
			[50, 100, 150, 200, 1000, 1050],
			{ snapshot: false }
		);
	});

	it('does not continue when nothing is playing', () => {
		const stopped = { ...track({ id: 'x', to: [1, 0, 0], duration: 10 }), isPlaying: false };
		expect(continueAnimations([stopped], recorder([]).adapter as never)).toBeUndefined();
	});
});
