/**
 * `MapPrimitive`, the component that had no test.
 *
 * It is the core of this package — every other component either wraps it or
 * decorates it — and nothing exercised it, because it constructed its own
 * MapLibre map and jsdom has no WebGL context to give it. The absence was
 * structural, not neglect: there was no seam to test through.
 *
 * The injectable adapter is that seam, and these are the assertions it makes
 * possible. They are about the *contract between the component and whatever map
 * it drives* — what it asks for at mount, which events it listens to, and what
 * it does when state changes underneath it — which is exactly the part a real
 * MapLibre instance would have hidden behind a canvas.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import MapPrimitive from '../src/lib/components/MapPrimitive.svelte';
import { FakeMapAdapter } from './helpers/fake-adapter';

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function mountMap(stateOverrides: Record<string, unknown> = {}) {
	const store = createStore({
		initialState: { ...createInitialMapState({}), ...stateOverrides },
		reducer: mapReducer,
		dependencies: {}
	});
	const adapter = new FakeMapAdapter();
	const target = document.createElement('div');
	document.body.appendChild(target);
	const component = mount(MapPrimitive, { target, props: { store, adapter } });
	cleanup.push(() => {
		unmount(component);
		target.remove();
	});
	return { store, adapter, target };
}

describe('the component drives the adapter it was given', () => {
	it('initialises it', async () => {
		const { adapter } = mountMap();
		await settle();

		// Non-vacuity for this whole file: if the component built its own adapter
		// and ignored the prop, every assertion below would be about an object
		// nothing touched, and they would fail as "expected 0 calls" rather than
		// saying why.
		expect(adapter.initialized).toBe(true);
	});

	it('hands it the viewport from the store', async () => {
		const { adapter } = mountMap({
			viewport: { center: [4.9, 52.4] as [number, number], zoom: 11, bearing: 30, pitch: 45 }
		});
		await settle();

		const [call] = adapter.callsTo('initialize');
		expect(call).toBeDefined();
		const options = call!.args[1] as Record<string, unknown>;
		expect(options.center).toEqual([4.9, 52.4]);
		expect(options.zoom).toBe(11);
		expect(options.bearing).toBe(30);
		expect(options.pitch).toBe(45);
	});

	it('mounts it into a real container element', async () => {
		const { adapter } = mountMap();
		await settle();

		const container = adapter.callsTo('initialize')[0]!.args[0];
		expect(container).toBeInstanceOf(HTMLElement);
	});

	it('does not construct a map of its own', async () => {
		// The property that makes the rest of this file trustworthy, and the one
		// that would silently regress if someone restored a `createMapAdapter`
		// call: every instruction must go to the injected object.
		const { adapter, store } = mountMap();
		await settle();

		store.dispatch({ type: 'setZoom', zoom: 9 });
		flushSync();
		await settle();

		expect(adapter.calls.length).toBeGreaterThan(1);
	});
});

describe('it listens for what the map reports', () => {
	it('wires the events it depends on', async () => {
		const { adapter } = mountMap();
		await settle();

		// Asserted as a set, then by name. The count arm alone cannot tell six
		// handlers from three registered twice.
		const events = adapter.callsTo('on').map((c) => c.args[0]);
		expect(events.length).toBeGreaterThan(0);
		expect(new Set(events)).toEqual(
			new Set(['load', 'error', 'moveend', 'zoomend', 'dragstart', 'dragend'])
		);
	});

	it('marks the map loaded when the map says so', async () => {
		const { adapter, store } = mountMap();
		await settle();
		expect(store.state.isLoaded).toBe(false);

		adapter.emit('load');
		flushSync();
		await settle();

		expect(store.state.isLoaded).toBe(true);
	});

	it('records an error the map reports', async () => {
		const { adapter, store } = mountMap();
		await settle();

		adapter.emit('error', { error: { message: 'style failed to load' } });
		flushSync();
		await settle();

		expect(store.state.error).toBe('style failed to load');
	});
});

describe('it follows the store', () => {
	it('re-styles when the tile provider changes', async () => {
		const { adapter, store } = mountMap();
		await settle();
		const before = adapter.callsTo('changeStyle').length;

		store.dispatch({ type: 'changeTileProvider', provider: 'carto-dark' });
		flushSync();
		await settle();

		const styles = adapter.callsTo('changeStyle');
		expect(styles.length).toBe(before + 1);
		expect(String(styles[styles.length - 1]!.args[0])).toContain('dark-matter');
	});

	it('adds a marker the store gained', async () => {
		const { adapter, store } = mountMap();
		await settle();

		store.dispatch({
			type: 'addMarker',
			marker: { id: 'm1', position: [0, 0] as [number, number] }
		});
		flushSync();
		await settle();

		const added = adapter.callsTo('addMarker');
		expect(added.length).toBe(1);
		expect((added[0]!.args[0] as { id: string }).id).toBe('m1');
	});

	it('removes a marker the store lost', async () => {
		const { adapter, store } = mountMap();
		await settle();
		store.dispatch({
			type: 'addMarker',
			marker: { id: 'm1', position: [0, 0] as [number, number] }
		});
		flushSync();
		await settle();

		store.dispatch({ type: 'removeMarker', id: 'm1' });
		flushSync();
		await settle();

		expect(adapter.callsTo('removeMarker').map((c) => c.args[0])).toEqual(['m1']);
	});
});

describe('it lets go on unmount', () => {
	it('destroys the adapter', async () => {
		const { adapter } = mountMap();
		await settle();
		expect(adapter.initialized).toBe(true);

		cleanup.forEach((fn) => fn());
		cleanup = [];
		await settle();

		expect(adapter.callsTo('destroy').length).toBe(1);
		expect(adapter.initialized).toBe(false);
	});
});
