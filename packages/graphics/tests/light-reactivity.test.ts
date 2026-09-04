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

import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer';
import { createInitialGraphicsState } from '../src/core/initial-state';
import Light from '../src/components/Light.svelte';
import LightPropsHarness from './test-components/LightPropsHarness.svelte';
import GeneratedIdHarness from './test-components/GeneratedIdHarness.svelte';
import ChangingIdHarness from './test-components/ChangingIdHarness.svelte';
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
	// Idempotent: one test unmounts its own instance to assert on removal, and
	// letting `afterEach` unmount it a second time logs `lifecycle_double_unmount`
	// on every run — noise that trains you to ignore Svelte's warnings.
	let live = true;
	const teardown = () => {
		if (live) unmount(instance);
		live = false;
		target.remove();
	};
	cleanup.push(teardown);
	return { target, instance, teardown };
}

describe('the config each type builds', () => {
	// `<Light>` used to declare one flat props object and drop, per type,
	// whatever that arm's switch case did not name — so these were the arms
	// nothing ever checked. The props type is discriminated now, and
	// `tests/light-props.types.ts` pins the rejections; these pin what the
	// accepted props actually become.

	it('sends a directional light a direction, not a position', () => {
		const store = makeStore();
		mountIn(Light, { store, id: 'key', type: 'directional', direction: [1, 2, 3], intensity: 1 });
		flushSync();

		const light = store.state.lights.find((l) => l.id === 'key');
		expect(light).toMatchObject({ type: 'directional', direction: [1, 2, 3] });
		expect(light, 'a directional light was given a position').not.toHaveProperty('position');
	});

	it('honours angle={0} instead of replacing it with 45°', () => {
		// `angle || Math.PI / 4`. A zero cone is degenerate, but it is what the
		// caller asked for, and `||` silently substituted its own answer.
		const store = makeStore();
		mountIn(Light, {
			store,
			id: 'spot',
			type: 'spot',
			position: [0, 5, 0],
			direction: [0, -1, 0],
			angle: 0,
			intensity: 1
		});
		flushSync();

		expect(store.state.lights.find((l) => l.id === 'spot')).toMatchObject({ angle: 0 });
	});

	it('still defaults the angle when none is given', () => {
		// The paired half — `??` must not stop defaulting.
		const store = makeStore();
		mountIn(Light, { store, id: 'spot', type: 'spot', position: [0, 5, 0], intensity: 1 });
		flushSync();

		expect(store.state.lights.find((l) => l.id === 'spot')).toMatchObject({
			angle: Math.PI / 4
		});
	});

	it('omits an absent radius rather than sending undefined', () => {
		// The reducer merges with a spread, so `radius: undefined` would
		// overwrite a configured value with nothing. `Camera.svelte` carries the
		// same conditional-spread idiom and a comment recording that bug.
		const store = makeStore();
		mountIn(Light, { store, id: 'lamp', type: 'point', position: [0, 1, 0], intensity: 1 });
		flushSync();

		expect(store.state.lights.find((l) => l.id === 'lamp')).not.toHaveProperty('radius');
	});

	it('sends a radius of 0', () => {
		// The paired half: conditional spreading must key on `undefined`, not on
		// truthiness, or `radius={0}` disappears.
		const store = makeStore();
		mountIn(Light, {
			store,
			id: 'lamp',
			type: 'point',
			position: [0, 1, 0],
			radius: 0,
			intensity: 1
		});
		flushSync();

		expect(store.state.lights.find((l) => l.id === 'lamp')).toMatchObject({ radius: 0 });
	});

	it('uses the documented default for each arm', () => {
		// Every one of these four could be changed for free: nothing asserted a
		// default value, so the commit that renamed `position` to `direction`
		// could also have moved the defaults without a test noticing.
		const store = makeStore();

		mountIn(Light, { store, id: 'dir', type: 'directional', intensity: 1 });
		mountIn(Light, { store, id: 'pt', type: 'point', intensity: 1 });
		mountIn(Light, { store, id: 'sp', type: 'spot', intensity: 1 });
		flushSync();

		const byId = (id: string) => store.state.lights.find((l) => l.id === id);
		expect(byId('dir'), 'the directional default moved').toMatchObject({
			direction: [0, 1, 0]
		});
		expect(byId('pt'), 'the point default moved').toMatchObject({ position: [0, 1, 0] });
		expect(byId('sp'), 'the spot defaults moved').toMatchObject({
			position: [0, 1, 0],
			direction: [0, -1, 0],
			angle: Math.PI / 4
		});
	});

	it('omits an absent color rather than sending undefined', () => {
		const store = makeStore();
		mountIn(Light, { store, id: 'lamp', type: 'ambient', intensity: 1 });
		flushSync();

		expect(store.state.lights.find((l) => l.id === 'lamp')).not.toHaveProperty('color');
	});
});

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

		a.teardown();
		flushSync();

		expect(
			store.state.lights.map((l) => l.id),
			'unmounting removed the wrong light'
		).toEqual(['ambient-default', 'b', 'c']);
	});

	it('gives each light without an explicit id a distinct one', () => {
		// This test used to assert only `toBeTruthy()` on a single light's id,
		// which a hardcoded literal passes — so it pinned neither of the two
		// properties the id-based rewrite rests on. Uniqueness is the first:
		// two lights sharing an id overwrite each other in the store.
		const store = makeStore();
		mountIn(Light, { store, type: 'point', position: [0, 1, 0], intensity: 1 });
		mountIn(Light, { store, type: 'point', position: [0, 2, 0], intensity: 2 });
		flushSync();

		const added = store.state.lights.filter((l) => l.id !== 'ambient-default');
		expect(added, 'two lights collapsed into one').toHaveLength(2);
		expect(new Set(added.map((l) => l.id)).size, 'both lights share an id').toBe(2);
	});

	it('keeps a generated id stable across prop changes', () => {
		// Stability is the second: an id that changed per render would make every
		// update address a light that no longer exists, and `updateLight` drops
		// an unknown id — so the light would freeze at its mount-time values
		// while the store filled with orphans.
		const store = makeStore();
		const { target } = mountIn(GeneratedIdHarness, { store });
		flushSync();

		const before = store.state.lights.filter((l) => l.id !== 'ambient-default');
		expect(before).toHaveLength(1);

		target.querySelector<HTMLButtonElement>('[data-testid="brighten"]')!.click();
		flushSync();

		const after = store.state.lights.filter((l) => l.id !== 'ambient-default');
		expect(after, 'the update orphaned the original light').toHaveLength(1);
		expect(after[0]!.id, 'the generated id changed between renders').toBe(before[0]!.id);
		expect(after[0]!.intensity, 'the update never landed').toBe(0.9);
	});

	it('renaming a light moves it rather than orphaning it', () => {
		// `updateLight` drops an id it does not know, in silence. So a changed
		// `id` used to dispatch an update nobody received, leaving the original
		// light in the store and in the scene — and `onDestroy` then removed the
		// *new* id, so the orphan survived the component itself.
		const store = makeStore();
		const { target } = mountIn(ChangingIdHarness, { store });
		flushSync();

		expect(store.state.lights.map((l) => l.id)).toEqual(['ambient-default', 'first']);

		target.querySelector<HTMLButtonElement>('[data-testid="rename"]')!.click();
		flushSync();

		expect(store.state.lights.map((l) => l.id), 'the rename left an orphan').toEqual([
			'ambient-default',
			'second'
		]);
	});

	it('unmounting after a rename leaves nothing behind', () => {
		const store = makeStore();
		const { target, teardown } = mountIn(ChangingIdHarness, { store });
		flushSync();
		target.querySelector<HTMLButtonElement>('[data-testid="rename"]')!.click();
		flushSync();

		teardown();
		flushSync();

		expect(store.state.lights.map((l) => l.id)).toEqual(['ambient-default']);
	});

	it('registers itself once, not twice', () => {
		// `onMount` dispatched `addLight` and the effect then skipped its own
		// first run via a `mounted` flag — but that flag was `$state`, so writing
		// it inside the effect that read it scheduled a second run, and mount
		// dispatched `addLight` *then* `updateLight`. The gate turned one run
		// into two; only value-idempotency in the reducer hid it.
		const store = makeStore();
		const seen: string[] = [];
		const unsubscribe = store.subscribeToActions?.((action) => seen.push(action.type));

		mountIn(Light, { store, id: 'once', type: 'point', position: [0, 1, 0], intensity: 1 });
		flushSync();
		unsubscribe?.();

		expect(seen).toEqual(['addLight']);
	});

	it('stands aside instead of fighting a light that already owns the id', () => {
		const store = makeStore();
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

		mountIn(Light, { store, id: 'shared', type: 'point', position: [0, 1, 0], intensity: 1 });
		mountIn(Light, { store, id: 'shared', type: 'point', position: [0, 9, 0], intensity: 5 });
		flushSync();

		// The first one keeps the id and its own values; the second says so.
		expect(store.state.lights.filter((l) => l.id === 'shared')).toHaveLength(1);
		expect(store.state.lights.find((l) => l.id === 'shared')?.intensity).toBe(1);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('already in use'));
	});

	it('unmounting the inert duplicate leaves the real light alone', () => {
		// The paired half of standing aside: a component that failed to claim
		// the id must not claim it on the way out either. Recording ownership
		// regardless would make the duplicate's `onDestroy` remove the light
		// belonging to the component that actually owns it.
		const store = makeStore();
		vi.spyOn(console, 'warn').mockImplementation(() => {});

		mountIn(Light, { store, id: 'shared', type: 'point', position: [0, 1, 0], intensity: 1 });
		const duplicate = mountIn(Light, {
			store,
			id: 'shared',
			type: 'point',
			position: [0, 9, 0],
			intensity: 5
		});
		flushSync();

		duplicate.teardown();
		flushSync();

		expect(
			store.state.lights.map((l) => l.id),
			'the duplicate took the real light with it'
		).toEqual(['ambient-default', 'shared']);
	});
});