/**
 * A `<Camera>` without `fov` must not wipe the configured field of view.
 *
 * `Camera.svelte` builds its config with `$derived({ type, position, lookAt,
 * fov, near, far })` — an object literal, so all six keys are always present,
 * and `fov`/`near`/`far` hold `undefined` when the props are omitted. The
 * reducer then merges with `{ ...state.camera, ...action.camera }`, and
 * spreading an explicit `undefined` overwrites. `initial-state.ts` ships
 * `fov: 45, near: 0.1, far: 1000`; all three are lost.
 *
 * It goes unnoticed downstream because `babylon-adapter.ts:136,141,144` guard
 * with `!== undefined` before applying each one — so the adapter quietly never
 * sets a field of view rather than erroring.
 *
 * This is the same family as the four `$derived`-config-dispatched-from-`$effect`
 * defects fixed in maps and graphics earlier (R1 in the hardening register). It
 * stayed invisible longer because graphics' tsconfig did not extend the root, so
 * `exactOptionalPropertyTypes` never ran on it.
 *
 * Kept in its own file: a runaway effect poisons Svelte's error state for the
 * rest of a test file, and `Camera` is one of the four components that had one.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { ComponentProps } from 'svelte';
import { createStore } from '@composable-svelte/core';
import Camera from '../src/components/Camera.svelte';
import { graphicsReducer } from '../src/core/reducer.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';
import type { CameraConfig, Vector3 } from '../src/core/types.js';

const position: Vector3 = [0, 5, 10];
const lookAt: Vector3 = [0, 0, 0];

const makeStore = () =>
	createStore({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});

/**
 * Exactly what `Camera.svelte` sends when only the required props are given.
 * Built the way the component builds it — conditional spread on the optionals —
 * so this test tracks the component rather than an idealised payload.
 */
function cameraConfigFrom(props: {
	type?: CameraConfig['type'];
	position: Vector3;
	lookAt: Vector3;
	fov?: number;
	near?: number;
	far?: number;
}): Partial<CameraConfig> {
	const { type = 'perspective', position, lookAt, fov, near, far } = props;
	return {
		type,
		position,
		lookAt,
		...(fov !== undefined && { fov }),
		...(near !== undefined && { near }),
		...(far !== undefined && { far })
	};
}

describe('camera config merging', () => {
	it('ships a default fov, near and far', () => {
		const { camera } = createInitialGraphicsState();
		expect(camera.fov).toBe(45);
		expect(camera.near).toBe(0.1);
		expect(camera.far).toBe(1000);
	});

	it('keeps fov, near and far when a Camera omits them', () => {
		const store = makeStore();

		store.dispatch({
			type: 'updateCamera',
			camera: cameraConfigFrom({ position, lookAt })
		});

		expect(store.state.camera.position).toEqual(position);
		expect(store.state.camera.fov, 'fov was clobbered by an absent prop').toBe(45);
		expect(store.state.camera.near).toBe(0.1);
		expect(store.state.camera.far).toBe(1000);
	});

	it('still applies fov, near and far when a Camera supplies them', () => {
		const store = makeStore();

		store.dispatch({
			type: 'updateCamera',
			camera: cameraConfigFrom({ position, lookAt, fov: 60, near: 1, far: 500 })
		});

		expect(store.state.camera.fov).toBe(60);
		expect(store.state.camera.near).toBe(1);
		expect(store.state.camera.far).toBe(500);
	});

	it('an explicit undefined does clobber — which is why the component must omit', () => {
		const store = makeStore();

		// The shape Camera.svelte produced before the fix.
		store.dispatch({
			type: 'updateCamera',
			// `as unknown as` because the shape is the *subject*: under
			// `exactOptionalPropertyTypes` an explicit `fov: undefined` is not a
			// `Partial<CameraConfig>` at all, which is precisely the bug this test
			// pins. A direct cast no longer compiles, and repairing the shape would
			// delete the test.
			camera: { type: 'perspective', position, lookAt, fov: undefined } as unknown as Partial<CameraConfig>
		});

		expect(store.state.camera.fov).toBeUndefined();
	});
});

describe('the Camera component', () => {
	let cleanup: Array<() => void> = [];

	afterEach(() => {
		cleanup.forEach((fn) => fn());
		cleanup = [];
	});

	/**
	 * Mounts into a real detached node, as tests/component-mount.test.ts does.
	 *
	 * Props derived from the component rather than typed `Record<string,
	 * unknown>`: `Camera` requires `position` and `lookAt`, and the loose record
	 * meant nothing checked that a call site supplied them. `svelte-check` reads
	 * the component; `tsc` cannot, which is why this went unseen.
	 */
	function mountInto(
		store: ReturnType<typeof makeStore>,
		props: Omit<ComponentProps<typeof Camera>, 'store'>
	) {
		const target = document.createElement('div');
		document.body.appendChild(target);

		const component = mount(Camera, { target, props: { store, ...props } });
		// The effect's dispatch lands after `mount()` returns. Without this the
		// assertions read the initial state and pass for the wrong reason — which
		// they did on the first draft of this test.
		flushSync();
		cleanup.push(() => {
			unmount(component);
			target.remove();
		});
		return store;
	}

	function mountCamera(props: Omit<ComponentProps<typeof Camera>, 'store'>) {
		return mountInto(makeStore(), props);
	}

	it('does not clobber fov, near and far when they are not passed', () => {
		const store = mountCamera({ position, lookAt });

		expect(store.state.camera.position).toEqual(position);
		expect(store.state.camera.fov, 'mounting <Camera> without fov wiped it').toBe(45);
		expect(store.state.camera.near).toBe(0.1);
		expect(store.state.camera.far).toBe(1000);
	});

	it('applies fov, near and far when they are passed', () => {
		const store = mountCamera({ position, lookAt, fov: 60, near: 1, far: 500 });

		expect(store.state.camera.fov).toBe(60);
		expect(store.state.camera.near).toBe(1);
		expect(store.state.camera.far).toBe(500);
	});

	it('passes orthoSize through, so the documented example does something', () => {
		// `orthoSize` is documented in the skill file as a `<Camera>` prop with a
		// copy-pasteable example, `CameraConfig` has always carried the field and
		// the adapter reads it — but the component did not accept it, so the
		// example set nothing and the camera fell back to the default half-height.
		const store = mountCamera({ position, lookAt, type: 'orthographic', orthoSize: 8 });

		expect(store.state.camera.type).toBe('orthographic');
		expect(store.state.camera.orthoSize, 'orthoSize never reached the store').toBe(8);
	});

	it('does not wipe a configured orthoSize when the prop is absent', () => {
		// The paired half, and the same defect the fov/near/far case above pins:
		// an object literal always carries every key it names, so an
		// unconditional `{ orthoSize }` sends `orthoSize: undefined` and the
		// reducer's `{ ...state.camera, ...action.camera }` merge overwrites with
		// it. Asserting `toBeUndefined()` after a bare mount cannot catch that —
		// absent and explicitly-undefined read identically — so the value has to
		// already be set before the component mounts.
		const store = makeStore();
		store.dispatch({
			type: 'updateCamera',
			camera: { type: 'orthographic', position, lookAt, orthoSize: 12 }
		});

		mountInto(store, { position, lookAt, type: 'orthographic' });

		expect(store.state.camera.orthoSize, 'mounting <Camera> wiped orthoSize').toBe(12);
	});
});