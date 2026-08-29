/**
 * `TileProviderControl` — the map style picker, and the last component in this
 * package that no test executed.
 *
 * It is a `[x]` item on the Phase 12B roadmap and it renders in the styleguide,
 * so it is advertised as finished and shipped to users. G2 tested the registry
 * behind it — `getAvailableTileProviders`, `getStyleURL` — and not the dropdown,
 * which is where the registry becomes something a person can click. That gap is
 * how the `mapbox` entry stayed in the list: the data was checked, the control
 * that renders it was not.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import { getAvailableTileProviders } from '../src/lib/utils/tile-providers';
import TileProviderControl from '../src/lib/components/TileProviderControl.svelte';

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function renderControl(props: Record<string, unknown> = {}) {
	const store = createStore({
		initialState: createInitialMapState({}),
		reducer: mapReducer,
		dependencies: {}
	});
	const target = document.createElement('div');
	document.body.appendChild(target);
	const instance = mount(TileProviderControl as never, {
		target,
		props: { store, ...props } as never
	});
	cleanup.push(() => {
		unmount(instance);
		target.remove();
	});

	const select = target.querySelector('select') as HTMLSelectElement | null;
	expect(select, 'TileProviderControl rendered no <select>').not.toBeNull();
	return { store, target, select: select! };
}

describe('it offers what the registry holds', () => {
	it('lists every available provider, and only those', () => {
		// Asserted against the registry rather than a hardcoded list, so adding a
		// provider does not silently fail to appear in the control — and so a
		// provider removed from the registry cannot linger in the dropdown, which
		// is exactly what `mapbox` did.
		const { select } = renderControl();
		const offered = [...select.querySelectorAll('option')].map((o) => o.value);

		expect(offered.length).toBeGreaterThan(3);
		expect(offered.sort()).toEqual(getAvailableTileProviders().map((p) => p.id).sort());
	});

	it('does not offer the mapbox style MapLibre cannot load', () => {
		// The specific case, named. It was in this dropdown until G2 removed it
		// from the registry, and nothing here would have noticed either way.
		const { select } = renderControl();
		expect([...select.querySelectorAll('option')].map((o) => o.value)).not.toContain('mapbox');
	});

	it('labels each option with the provider’s name', () => {
		const { select } = renderControl();
		const labels = [...select.querySelectorAll('option')].map((o) => o.textContent?.trim());
		for (const provider of getAvailableTileProviders()) {
			expect(labels, `${provider.id} is offered without its name`).toContain(provider.name);
		}
	});
});

describe('it shows and changes the current provider', () => {
	it('starts on the store’s provider', () => {
		const { store, select } = renderControl();
		expect(select.value).toBe(store.state.tileProvider);
	});

	it('follows the store when the provider changes elsewhere', () => {
		// The control is not the only thing that can change the style, so it has
		// to reflect state rather than only drive it.
		const { store, select } = renderControl();
		expect(select.value).not.toBe('carto-dark');

		store.dispatch({ type: 'changeTileProvider', provider: 'carto-dark' });
		flushSync();

		expect(select.value).toBe('carto-dark');
	});

	it('dispatches the provider the user picked', () => {
		const { store, select } = renderControl();

		select.value = 'stadia';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();

		expect(store.state.tileProvider).toBe('stadia');
	});

	it('changes the style URL, not only the name', () => {
		// A picker that records a choice without restyling the map is the failure
		// this actually needs to prevent.
		const { store, select } = renderControl();
		const before = store.state.style;

		select.value = 'carto-dark';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();

		expect(store.state.style).not.toBe(before);
		expect(store.state.style).toContain('dark-matter');
	});
});

describe('presentation', () => {
	it('labels the control for a screen reader', () => {
		// A bare `<select>` announces nothing about what it selects.
		const { target, select } = renderControl();
		const label = target.querySelector('label');
		expect(label, 'the control has no <label>').not.toBeNull();
		expect(label!.getAttribute('for')).toBe(select.id);
		expect(select.id).toBeTruthy();
	});

	it('accepts undefined for its optional props', () => {
		const { select } = renderControl({ position: undefined, class: undefined });
		expect(select.querySelectorAll('option').length).toBeGreaterThan(0);
	});

	it('places itself where asked', () => {
		const topLeft = renderControl({ position: 'top-left' });
		const bottomRight = renderControl({ position: 'bottom-right' });
		const classesOf = (t: HTMLElement) =>
			(t.querySelector('.tile-provider-control') as HTMLElement).className;

		expect(classesOf(topLeft.target)).not.toBe(classesOf(bottomRight.target));
	});
});
