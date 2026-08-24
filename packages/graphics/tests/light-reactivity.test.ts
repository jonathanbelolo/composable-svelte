/**
 * `<Light>` props must reach the store.
 *
 * The component had `onMount` and `onDestroy` and no `$effect` at all, so
 * `lightConfig` — a `$derived` — recomputed on every prop change and nothing
 * ever consumed the result. `<Light intensity={brightness} />` with a changing
 * `brightness` did nothing, forever. `Camera.svelte` and `Mesh.svelte` both
 * carry the shape this now copies.
 *
 * The removal half is the other defect: the component captured
 * `store.state.lights.length - 1` at mount and removed by that number, while
 * the reducer filtered positionally. With the default ambient light in slot 0,
 * unmounting several `<Light>` children removed the wrong ones.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import Light from '../src/components/Light.svelte';
import LightPropsHarness from './test-components/LightPropsHarness.svelte';
import type { GraphicsAction, GraphicsState } from '../src/core/types';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

const makeStore = () =>
	createStore<GraphicsState, GraphicsAction>({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});

function mountIn(Component: unknown, props: Record<string, unknown>) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(Component as never, { target, props });
	cleanup.push(() => {
		unmount(instance);
		target.remove();
	});
	return { target, instance };
}

describe('Light', () => {
	it('a changed prop reaches the store', () => {
		const store = makeStore();
		const { target } = mountIn(LightPropsHarness, { store });
		flushSync();

		expect(store.state.lights.find((l) => l.id === 'key')?.intensity).toBe(0.4);

		target.querySelector<HTMLButtonElement>('[data-testid="brighten"]')!.click();
		flushSync();

		expect(
			store.state.lights.find((l) => l.id === 'key')?.intensity,
			'the prop change never reached the store — Light has no effect'
		).toBe(0.9);
	});

	it('unmounting one of several removes the right light', () => {
		const store = makeStore();
		// The default state ships one ambient light, so these take slots 1..3 —
		// exactly the arrangement that made index-based removal wrong.
		const a = mountIn(Light, { store, id: 'a', type: 'point', position: [0, 1, 0], intensity: 1 });
		mountIn(Light, { store, id: 'b', type: 'point', position: [0, 1, 0], intensity: 2 });
		mountIn(Light, { store, id: 'c', type: 'point', position: [0, 1, 0], intensity: 3 });
		flushSync();

		expect(store.state.lights.map((l) => l.id)).toEqual(['ambient-default', 'a', 'b', 'c']);

		unmount(a.instance);
		flushSync();

		expect(
			store.state.lights.map((l) => l.id),
			'unmounting removed the wrong light'
		).toEqual(['ambient-default', 'b', 'c']);
	});

	it('generates a stable id when none is given', () => {
		const store = makeStore();
		mountIn(Light, { store, type: 'point', position: [0, 1, 0], intensity: 1 });
		flushSync();

		const added = store.state.lights.filter((l) => l.id !== 'ambient-default');
		expect(added).toHaveLength(1);
		expect(added[0]!.id, 'no id was generated').toBeTruthy();
	});
});
