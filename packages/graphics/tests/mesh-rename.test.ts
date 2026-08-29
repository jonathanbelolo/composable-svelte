/**
 * A `<Mesh>` that changes its id must release the mesh it owned.
 *
 * It does, unless the new geometry is also invalid — and then it does not,
 * because the geometry pre-check `return`s *above* the block that dispatches
 * `removeMesh` for the old id. The component goes inert, as intended, while the
 * mesh it used to own stays in the scene.
 *
 * The pre-check was moved above the ownership branch deliberately: below it, it
 * closed only the add path while its comment claimed both. Moving it fixed that
 * and opened this, which is the same two-fixes-interfering shape the register
 * keeps recording.
 *
 * Nothing could reach this: `MeshGeometryHarness` hard-codes `id="custom"`, so
 * the whole rename path was untestable with the harness that existed.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MeshRenameHarness from './test-components/MeshRenameHarness.svelte';
import { createStore } from '@composable-svelte/core';
import { graphicsReducer } from '../src/core/reducer.js';
import { createInitialGraphicsState } from '../src/core/initial-state.js';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
	vi.restoreAllMocks();
});

function mountHarness() {
	const store = createStore({
		initialState: createInitialGraphicsState(),
		reducer: graphicsReducer,
		dependencies: {}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(MeshRenameHarness as never, { target, props: { store } as never });
	flushSync();
	cleanup.push(() => {
		unmount(instance);
		target.remove();
	});

	const click = (id: string) => {
		(target.querySelector(`[data-testid="${id}"]`) as HTMLButtonElement).click();
		flushSync();
	};
	const ids = () => store.state.meshes.map((m) => m.id);
	return { store, ids, click };
}

describe('renaming a mesh', () => {
	it('starts owning the first id', () => {
		// Non-vacuity: every arm below is about what happens to `first`, and none
		// of them means anything if `first` was never added.
		const { ids } = mountHarness();
		expect(ids()).toEqual(['first']);
	});

	it('releases the old id when the new geometry is valid', () => {
		const { ids, click } = mountHarness();
		click('rename');
		expect(ids()).toEqual(['second']);
	});

	it('releases the old id even when the new geometry is invalid', () => {
		// The defect. The component is correctly inert — it adds nothing — but it
		// must not leave the mesh it used to own behind in the scene.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { ids, click } = mountHarness();

		click('rename-broken');

		expect(ids(), 'the renamed component orphaned the mesh it used to own').toEqual([]);
	});

	it('still refuses to add the invalid mesh', () => {
		// The other half: releasing the old id must not turn into adding the bad
		// one. Inert means inert.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { ids, click } = mountHarness();

		click('rename-broken');

		expect(ids()).not.toContain('second');
	});

	it('adds the new mesh once the geometry is repaired', () => {
		// And recovery still works from that state.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { ids, click } = mountHarness();

		click('rename-broken');
		click('repair');

		expect(ids()).toEqual(['second']);
	});
});

describe('a mesh that keeps its id', () => {
	it('is not removed when its geometry goes invalid', () => {
		// The narrowing on the release, and the reason it is narrowed. A mesh
		// already in the scene whose geometry later breaks keeps rendering what
		// it last built — removing it would make a working mesh vanish because a
		// prop it cannot use changed. Only a *rename* orphans, so only a rename
		// releases.
		//
		// Without this arm, dropping the `ownedId !== config.id` condition passes
		// the whole suite, which is to say the condition would be unverified.
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { ids, click } = mountHarness();
		expect(ids()).toEqual(['first']);

		click('break');

		expect(ids(), 'a mesh vanished because its geometry changed under it').toEqual(['first']);
	});
});
