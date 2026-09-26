import { afterEach, expect, it } from 'vitest';
import { hydrate, mount, tick, unmount } from 'svelte';
import type { ApplicationInstance } from '../src/lib/application/index.js';
import PlacementStructure from './fixtures/PlacementStructure.svelte';
import FeatureViewsApp from './fixtures/FeatureViewsApp.svelte';
import type { Action, Root } from './fixtures/FeatureViewsModel.js';
import html from './fixtures/feature-views-ssr.html?raw';

const releases: Array<() => Promise<void>> = [];

afterEach(async () => {
	for (const release of releases.splice(0).reverse()) await release();
});

function target() {
	const node = document.createElement('div');
	document.body.append(node);
	return node;
}

it.each(['none', 'multiple'] as const)(
	'%s connected presentation surfaces skip capture and keep the application live',
	async (surfaceMode) => {
		const root = target();
		let app: ApplicationInstance<Root, Action> | undefined;
		const component = mount(PlacementStructure, {
			target: root,
			props: { surfaceMode, onApp: (value) => (app = value) }
		});
		releases.push(async () => {
			try {
				await unmount(component);
			} finally {
				root.remove();
			}
		});
		await tick();

		app!.store.dispatch({ type: 'removeRow' });
		await tick();
		expect(root.querySelector('[data-row="row1"]')).toBeNull();
		expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull();

		app!.store.dispatch({ type: 'rows', id: 2, action: { type: 'increment' } });
		await tick();
		expect(app!.store.state.rows[0]!.state.count).toBe(3);
		expect(root.querySelector<HTMLElement>('[data-row="row2"]')!.dataset.count).toBe('3');
	}
);

it('hydrates server rows without replacement and preserves structural selectors', async () => {
	const root = target();
	root.innerHTML = html;
	const originalFirst = root.querySelector<HTMLElement>('[data-leaf="row1"]');
	const originalSecond = root.querySelector<HTMLElement>('[data-leaf="row2"]');
	expect(originalFirst).not.toBeNull();
	expect(originalSecond).not.toBeNull();

	const component = hydrate(FeatureViewsApp, {
		target: root,
		props: { count: 3, dependencies: { step: 2, trace: [] } }
	});
	releases.push(async () => {
		try {
			await unmount(component);
		} finally {
			root.remove();
		}
	});
	await tick();

	const list = root.querySelector('aside');
	expect(list).not.toBeNull();
	expect(list!.querySelector(':scope > [data-leaf="row1"]:first-child')).toBe(originalFirst);
	expect(list!.querySelector(':scope > [data-leaf="row2"]:nth-child(2)')).toBe(originalSecond);
	expect(Array.from(list!.querySelectorAll(':scope > [data-leaf] + [data-leaf]'))).toEqual([
		originalSecond
	]);
});

it('surfaceless removal does not supersede an in-flight exit run on the same outlet', async () => {
	const root = target();
	let app: ApplicationInstance<Root, Action> | undefined;
	const component = mount(PlacementStructure, {
		target: root,
		props: { surfaceMode: 'mixed', onApp: (value) => (app = value) }
	});
	releases.push(async () => {
		try {
			await unmount(component);
		} finally {
			root.remove();
		}
	});
	await tick();

	expect(root.querySelector('[data-row="row1"]')).not.toBeNull();
	expect(root.querySelector('[data-row="row2"]')).not.toBeNull();

	app!.store.dispatch({ type: 'removeRow', id: 1 });
	await tick();

	expect(root.querySelector('[data-row="row1"]')).toBeNull();
	const layer = document.body.querySelector<HTMLElement>('[aria-hidden="true"]');
	expect(layer).not.toBeNull();
	const animations = layer!.getAnimations({ subtree: true });
	expect(animations).toHaveLength(1);
	const animation = animations[0]!;
	expect(animation.playState).toBe('running');

	app!.store.dispatch({ type: 'removeRow', id: 2 });
	await tick();

	expect(document.body.contains(layer!)).toBe(true);
	expect(layer!.children).toHaveLength(1);
	expect(animation.playState).toBe('running');
	expect(app!.store.state.rows).toHaveLength(0);
	expect(root.querySelector('[data-row="row2"]')).toBeNull();

	animation.finish();
	await animation.finished;
	await tick();

	expect(document.body.querySelector('[aria-hidden="true"]')).toBeNull();
});
