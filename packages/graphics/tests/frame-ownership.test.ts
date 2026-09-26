import { describe, it, expect, vi, afterEach } from 'vitest';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import type { GraphicsAction, GraphicsState, MeshConfig } from '../src/core/types';

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

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

const flush = async (): Promise<void> => {
	for (let turn = 0; turn < 20; turn += 1) await Promise.resolve();
};

function setupControlledRAF(startHandle = 0) {
	let nextId = startHandle;
	const callbacks = new Map<number, FrameRequestCallback>();
	const cancelled: number[] = [];

	vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
		const id = nextId++;
		callbacks.set(id, cb);
		return id;
	});

	vi.stubGlobal('cancelAnimationFrame', (id: number) => {
		cancelled.push(id);
		callbacks.delete(id);
	});

	return {
		callbacks,
		cancelled,
		runAll: (time = 1000) => {
			const batch = Array.from(callbacks.entries());
			callbacks.clear();
			for (const [, cb] of batch) {
				cb(time);
			}
		}
	};
}

describe('frame ownership and cancellation', () => {
	it('cancels pending native frame when a new animation supersedes the frame loop', async () => {
		const raf = setupControlledRAF();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube({ id: 'mesh1' }) });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'anim1',
				targetId: 'mesh1',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 1000
			}
		});
		await flush();

		expect(raf.callbacks.size).toBe(1);
		const firstHandle = Array.from(raf.callbacks.keys())[0]!;

		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'anim2',
				targetId: 'mesh1',
				property: 'rotation',
				from: [0, 0, 0],
				to: [1, 1, 1],
				duration: 1000
			}
		});
		await flush();

		expect(raf.cancelled).toContain(firstHandle);
	});

	it('cancels pending native frame when store is destroyed', async () => {
		const raf = setupControlledRAF();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'anim1',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 1000
			}
		});
		await flush();

		const handle = Array.from(raf.callbacks.keys())[0]!;
		store.destroy?.();
		await flush();

		expect(raf.cancelled).toContain(handle);
		expect(raf.callbacks.size).toBe(0);
	});

	it('cancels native frame when the last active animation is stopped', async () => {
		const raf = setupControlledRAF();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'anim1',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 1000
			}
		});
		await flush();

		const handle = Array.from(raf.callbacks.keys())[0]!;
		store.dispatch({ type: 'stopAnimation', id: 'anim1' });
		await flush();

		expect(raf.cancelled).toContain(handle);
	});

	it('does not cancel shared frame when only one of multiple active animations is stopped', async () => {
		const raf = setupControlledRAF();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'anim1',
				targetId: 'cube',
				property: 'position',
				from: [0, 0, 0],
				to: [10, 0, 0],
				duration: 1000
			}
		});
		store.dispatch({
			type: 'startAnimation',
			animation: {
				id: 'anim2',
				targetId: 'cube',
				property: 'rotation',
				from: [0, 0, 0],
				to: [1, 1, 1],
				duration: 1000
			}
		});
		await flush();

		const currentHandle = Array.from(raf.callbacks.keys())[0]!;
		raf.cancelled.length = 0;

		store.dispatch({ type: 'stopAnimation', id: 'anim1' });
		await flush();

		expect(raf.cancelled).not.toContain(currentHandle);
		expect(raf.callbacks.has(currentHandle)).toBe(true);

		store.dispatch({ type: 'stopAnimation', id: 'anim2' });
		await flush();

		expect(raf.cancelled).toContain(currentHandle);
	});

	it('cancels frame when last animated mesh is removed and retains frame otherwise', async () => {
		const raf = setupControlledRAF();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube({ id: 'mesh1' }) });
		store.dispatch({ type: 'addMesh', mesh: cube({ id: 'mesh2' }) });
		store.dispatch({
			type: 'startAnimation',
			animation: { id: 'anim1', targetId: 'mesh1', property: 'position', from: [0, 0, 0], to: [10, 0, 0], duration: 1000 }
		});
		store.dispatch({
			type: 'startAnimation',
			animation: { id: 'anim2', targetId: 'mesh2', property: 'position', from: [0, 0, 0], to: [10, 0, 0], duration: 1000 }
		});
		await flush();

		const currentHandle = Array.from(raf.callbacks.keys())[0]!;
		raf.cancelled.length = 0;

		store.dispatch({ type: 'removeMesh', id: 'mesh1' });
		await flush();
		expect(raf.cancelled).not.toContain(currentHandle);

		store.dispatch({ type: 'removeMesh', id: 'mesh2' });
		await flush();
		expect(raf.cancelled).toContain(currentHandle);
	});

	it('cancels pending frame on clearScene when active animations exist', async () => {
		const raf = setupControlledRAF();
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: { id: 'anim1', targetId: 'cube', property: 'position', from: [0, 0, 0], to: [10, 0, 0], duration: 1000 }
		});
		await flush();

		const currentHandle = Array.from(raf.callbacks.keys())[0]!;
		store.dispatch({ type: 'clearScene' });
		await flush();

		expect(raf.cancelled).toContain(currentHandle);
	});

	it('stale cancelled RAF callback cannot dispatch tick or resurrect loop', async () => {
		let staleCallback: FrameRequestCallback | null = null;
		vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
			staleCallback = cb;
			return 42;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());

		const store = makeStore();
		let ticks = 0;
		store.subscribeToActions?.((action) => {
			if (action.type === 'tick') ticks++;
		});

		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: { id: 'anim1', targetId: 'cube', property: 'position', from: [0, 0, 0], to: [10, 0, 0], duration: 1000 }
		});
		await flush();

		store.dispatch({ type: 'stopAnimation', id: 'anim1' });
		await flush();

		expect(staleCallback).not.toBeNull();
		staleCallback!(1000);
		await flush();

		expect(ticks).toBe(0);
	});

	it('respects handle 0 and cancels it on abort', async () => {
		const raf = setupControlledRAF(0);
		const store = makeStore();
		store.dispatch({ type: 'addMesh', mesh: cube() });
		store.dispatch({
			type: 'startAnimation',
			animation: { id: 'anim1', targetId: 'cube', property: 'position', from: [0, 0, 0], to: [10, 0, 0], duration: 1000 }
		});
		await flush();

		expect(raf.callbacks.has(0)).toBe(true);
		store.dispatch({ type: 'stopAnimation', id: 'anim1' });
		await flush();

		expect(raf.cancelled).toContain(0);
	});
});
