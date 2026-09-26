import { expect, it } from 'vitest';
import { createRawSnippet, mount, tick, unmount } from 'svelte';
import ApplicationHost from '../src/lib/application/ApplicationHost.svelte';
import { rendererOwner } from '../src/lib/application/renderer/owner.js';
import { createStore } from '../src/lib/store.svelte.js';
import { definition } from './fixtures/Host0bModel.js';
import PlacementRaw from './fixtures/PlacementRaw.svelte';
import { composition, initial } from './fixtures/FeatureViewsModel.js';

const children = createRawSnippet(() => ({ render: () => '<span>host</span>' }));

it('releases a host unmounted before mount effects flush', async () => {
	const store = createStore({ initialState: { child: { opacity: '0.3' } }, ...definition });
	const owner = rendererOwner(store, definition.execution);
	const target = document.createElement('div');
	document.body.append(target);
	try {
		const first = mount(ApplicationHost, { target, props: { owner, children } });
		await unmount(first);
		expect(store._runtime!.resourceScope.size).toBe(0);

		const retry = mount(ApplicationHost, { target, props: { owner, children } });
		try {
			await tick();
			expect(store._runtime!.resourceScope.size).toBe(1);
		} finally {
			await unmount(retry);
		}
		expect(store._runtime!.resourceScope.size).toBe(0);
	} finally {
		store.destroy();
		target.remove();
	}
});

it('releases an outlet and view scope unmounted before mount effects flush', async () => {
	const store = createStore({
		initialState: initial(0),
		...composition,
		dependencies: { step: 1, trace: [] }
	});
	const target = document.createElement('div');
	document.body.append(target);
	try {
		const first = mount(PlacementRaw, { target, props: { store } });
		await unmount(first);

		const retry = mount(PlacementRaw, { target, props: { store } });
		try {
			await tick();
			expect(target.querySelectorAll('[data-leaf]')).toHaveLength(3);
		} finally {
			await unmount(retry);
		}
	} finally {
		store.destroy();
		target.remove();
	}
});
