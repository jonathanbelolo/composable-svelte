/**
 * Two graphics features under one store must not interfere.
 *
 * This is the promise the whole architecture rests on — reducers compose, and a
 * feature does not know or care what else is in the store. A cancellable effect
 * id is the one piece of a reducer's output that is *global by construction*:
 * the store keeps a single `inFlightEffects` map, and `Effect.map` preserves a
 * `Cancellable`'s id through every layer of scoping. So an id baked into the
 * module is shared by every instance of the feature, and re-registering it in
 * one slice aborts the other's in-flight effect for good.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore, Effect } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import type { GraphicsAction, GraphicsState, MeshConfig } from '../src/core/types';

afterEach(() => vi.unstubAllGlobals());

interface TwoScenes {
	left: GraphicsState;
	right: GraphicsState;
}

type TwoScenesAction =
	| { type: 'left'; action: GraphicsAction }
	| { type: 'right'; action: GraphicsAction };

/** The composition every navigation and list pattern in this library produces. */
const twoScenesReducer = (state: TwoScenes, action: TwoScenesAction, deps: never) => {
	const side = action.type;
	const [next, effect] = graphicsReducer(state[side], action.action, deps);

	return [
		{ ...state, [side]: next },
		Effect.map(effect, (child: GraphicsAction) => ({ type: side, action: child }))
	] as const;
};

/**
 * Drain the microtask queue.
 *
 * A single `await Promise.resolve()` is not enough: a dispatch travels through
 * the reducer, `Effect.map`, the store's `Promise.resolve(effect.execute(...))`
 * and the executor's own `await` before the next `requestAnimationFrame` is
 * queued, and that is several turns deep. Awaiting twice passed most of the
 * time, which is the worst kind of enough.
 */
const flush = async (): Promise<void> => {
	for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

const cube = (): MeshConfig => ({
	id: 'cube',
	geometry: { type: 'box', size: 1 },
	position: [0, 0, 0],
	material: { color: '#ff0000' }
});

const spin = () => ({
	id: 'spin',
	targetId: 'cube',
	property: 'position' as const,
	from: [0, 0, 0] as [number, number, number],
	to: [1000, 0, 0] as [number, number, number],
	duration: 100000,
	loop: true
});

describe('two graphics scenes in one store', () => {
	it('both keep animating', async () => {
		const queued: FrameRequestCallback[] = [];
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			queued.push(cb);
			return queued.length;
		});

		const store = createStore<TwoScenes, TwoScenesAction>({
			initialState: { left: createInitialGraphicsState(), right: createInitialGraphicsState() },
			reducer: twoScenesReducer as never,
			dependencies: {} as never
		});

		// Ticks per slice, not mesh position. Position is a proxy that depends on
		// wall-clock milliseconds having elapsed — and the whole test runs inside
		// one, so a slice whose loop is perfectly alive can still report a position
		// of exactly 0. That made the first version of this test fail about half
		// the time, for a reason that had nothing to do with what it was checking.
		const ticks = { left: 0, right: 0 };
		const unsubscribe = store.subscribeToActions?.((action) => {
			if (action.action.type === 'tick') ticks[action.type] += 1;
		});

		for (const side of ['left', 'right'] as const) {
			store.dispatch({ type: side, action: { type: 'addMesh', mesh: cube() } });
			store.dispatch({ type: side, action: { type: 'startAnimation', animation: spin() } });
			await flush();
		}

		for (let generation = 0; generation < 10; generation++) {
			queued.splice(0, queued.length).forEach((cb) => cb(0));
			await flush();
		}
		unsubscribe?.();

		// The one started first is the one that dies: the second slice's
		// `scheduleFrame` aborts its controller, and nothing ever restarts it.
		expect(
			ticks.left,
			`the first scene's frame loop was cancelled by the second (left=${ticks.left}, right=${ticks.right})`
		).toBe(10);
		expect(ticks.right).toBe(10);
	});

	it('gives each scene its own identity', () => {
		// What makes the above possible. Two scenes created independently must
		// not share the id their cancellable effects are keyed by.
		const a = createInitialGraphicsState();
		const b = createInitialGraphicsState();

		expect(a.sceneId).not.toBe(b.sceneId);
	});

	it('lets a consumer name a scene, for a stable id across reloads', () => {
		expect(createInitialGraphicsState({ sceneId: 'hero' }).sceneId).toBe('hero');
	});

	it('warns when two scenes are given the same explicit id', () => {
		// The escape hatch reopened the hole it was added beside: the JSDoc invites
		// supplying an id without ever saying two must differ from each other, and
		// two scenes sharing one cancel each other's frame loop in silence.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		createInitialGraphicsState({ sceneId: 'hero' });
		createInitialGraphicsState({ sceneId: 'hero' });

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('already in use'));
		warn.mockRestore();
	});

	it('does not hand a generated id to a scene that claimed it by hand', () => {
		// The counter and the explicit ids share one namespace, so an explicit
		// `scene-2` must not collide with the second generated one.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const claimed = createInitialGraphicsState().sceneId.replace(/\d+$/, (n) =>
			String(Number(n) + 1)
		);

		createInitialGraphicsState({ sceneId: claimed });
		const generated = createInitialGraphicsState().sceneId;

		expect(generated, 'a generated id collided with an explicit one').not.toBe(claimed);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it('warns when state arrives with no scene id at all', () => {
		// Hand-built state, or a payload serialised before `sceneId` existed.
		// `frameEffectId` would fall back to a constant — exactly the
		// cross-feature cancellation the field prevents — and one such scene runs
		// perfectly, so nothing would ever surface it.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const legacy = { ...createInitialGraphicsState(), sceneId: '' };
		const store = createStore<GraphicsState, GraphicsAction>({
			initialState: legacy,
			reducer: graphicsReducer,
			dependencies: {} as never
		});

		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'spin',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [1, 0, 0],
				duration: 1000
			}
		});

		expect(warn).toHaveBeenCalledWith(expect.stringContaining('no sceneId'));
		warn.mockRestore();
	});
});