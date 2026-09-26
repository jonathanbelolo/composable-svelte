/**
 * Focused lifecycle boundaries test for @composable-svelte/maps
 * Tests:
 * 1. Two sibling map instances mounting and operating independently.
 * 2. Unmounting one sibling while the other remains active.
 * 3. Rapid replacement of map instance in the same container.
 * 4. Delayed initialization and unmount before ready.
 * 5. Late native events emitted after component unmount.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '@composable-svelte/core';
import { mapReducer, createInitialMapState } from '../src/lib/reducers/map.reducer';
import MapPrimitive from '../src/lib/components/MapPrimitive.svelte';
import { FakeMapAdapter } from './helpers/fake-adapter';
import type { MapAction, MapInitOptions } from '../src/lib/types/map.types';

const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

function createMapStore(overrides: Record<string, unknown> = {}) {
	return createStore({
		initialState: { ...createInitialMapState({}), ...overrides },
		reducer: mapReducer,
		dependencies: {}
	});
}

describe('Map lifecycle boundaries: Two siblings', () => {
	it('mounts two sibling maps simultaneously with isolated states and adapters', async () => {
		const store1 = createMapStore({ viewport: { center: [10, 20] as [number, number], zoom: 5, bearing: 0, pitch: 0 } });
		const store2 = createMapStore({ viewport: { center: [30, 40] as [number, number], zoom: 8, bearing: 15, pitch: 30 } });
		const adapter1 = new FakeMapAdapter();
		const adapter2 = new FakeMapAdapter();

		const parent = document.createElement('div');
		const target1 = document.createElement('div');
		const target2 = document.createElement('div');
		parent.appendChild(target1);
		parent.appendChild(target2);
		document.body.appendChild(parent);

		let comp1: ReturnType<typeof mount> | null = mount(MapPrimitive, { target: target1, props: { store: store1, adapter: adapter1 } });
		let comp2: ReturnType<typeof mount> | null = mount(MapPrimitive, { target: target2, props: { store: store2, adapter: adapter2 } });

		cleanup.push(() => {
			if (comp1) unmount(comp1);
			if (comp2) unmount(comp2);
			parent.remove();
		});

		await settle();

		expect(adapter1.initialized).toBe(true);
		expect(adapter2.initialized).toBe(true);
		expect(adapter1.getCenter()).toEqual([10, 20]);
		expect(adapter2.getCenter()).toEqual([30, 40]);

		// Mutating store 1 affects only adapter 1
		store1.dispatch({ type: 'setZoom', zoom: 12 });
		flushSync();
		await settle();

		expect(adapter1.getZoom()).toBe(12);
		expect(adapter2.getZoom()).toBe(8);

		// Mutating store 2 affects only adapter 2
		store2.dispatch({ type: 'setBearing', bearing: 45 });
		flushSync();
		await settle();

		expect(adapter2.getBearing()).toBe(45);
		expect(adapter1.getBearing()).toBe(0);

		// Unmounting sibling 1 cleanly destroys adapter 1 while sibling 2 remains active
		unmount(comp1);
		comp1 = null;
		await settle();

		expect(adapter1.initialized).toBe(false);
		expect(adapter1.callsTo('destroy').length).toBe(1);

		// Sibling 2 still functional and receiving dispatches
		store2.dispatch({ type: 'setZoom', zoom: 14 });
		flushSync();
		await settle();

		expect(adapter2.getZoom()).toBe(14);
		expect(adapter2.initialized).toBe(true);
	});
});

describe('Map lifecycle boundaries: Delayed adapter operations and early unmount', () => {
	it('proves MapPrimitive invokes adapter.destroy() on unmount allowing adapter cleanup of pending timers', async () => {
		// Note: MapAdapter.initialize is currently synchronous. Delayed style 'load' is the
		// real async risk, while an async initialize would require a deliberate interface change.
		// This test proves that unmount calls adapter.destroy(), allowing an adapter to cancel
		// any internal timers or deferred work.
		class DelayedAdapter extends FakeMapAdapter {
			initCalled = false;
			delayedTimer: ReturnType<typeof setTimeout> | null = null;

			override initialize(container: HTMLElement, options: MapInitOptions) {
				this.initCalled = true;
				// Simulating pending deferred work (e.g. style loading or internal async work)
				this.delayedTimer = setTimeout(() => {
					super.initialize(container, options);
					this.emit('load');
				}, 100);
			}

			override destroy() {
				if (this.delayedTimer) {
					clearTimeout(this.delayedTimer);
					this.delayedTimer = null;
				}
				super.destroy();
			}
		}

		const store = createMapStore();
		const adapter = new DelayedAdapter();
		const target = document.createElement('div');
		document.body.appendChild(target);

		const comp = mount(MapPrimitive, { target, props: { store, adapter } });
		flushSync();
		// onMount has run synchronously after flushSync
		expect(adapter.initCalled).toBe(true);
		expect(adapter.initialized).toBe(false);

		// Unmount before delayed timer completes
		unmount(comp);
		target.remove();
		await settle();

		expect(adapter.callsTo('destroy').length).toBe(1);
		expect(store.state.isLoaded).toBe(false);
	});
});

describe('Map lifecycle boundaries: Replacement', () => {
	it('replaces a map instance with another without leaking callbacks or state', async () => {
		const target = document.createElement('div');
		document.body.appendChild(target);
		cleanup.push(() => target.remove());

		const store1 = createMapStore({ viewport: { center: [0, 0] as [number, number], zoom: 2, bearing: 0, pitch: 0 } });
		const adapter1 = new FakeMapAdapter();

		const comp1 = mount(MapPrimitive, { target, props: { store: store1, adapter: adapter1 } });
		await settle();
		expect(adapter1.initialized).toBe(true);

		// Replace with Map 2
		unmount(comp1);
		expect(adapter1.callsTo('destroy').length).toBe(1);

		const store2 = createMapStore({ viewport: { center: [50, 50] as [number, number], zoom: 10, bearing: 0, pitch: 0 } });
		const adapter2 = new FakeMapAdapter();

		const comp2 = mount(MapPrimitive, { target, props: { store: store2, adapter: adapter2 } });
		cleanup.push(() => unmount(comp2));
		await settle();

		expect(adapter2.initialized).toBe(true);
		expect(adapter2.getCenter()).toEqual([50, 50]);

		// Old adapter 1 does not receive store 2 updates
		store2.dispatch({ type: 'setZoom', zoom: 15 });
		flushSync();
		await settle();

		expect(adapter2.getZoom()).toBe(15);
		expect(adapter1.getZoom()).toBe(2);
	});
});

describe('Map lifecycle boundaries: Late native events after unmount', () => {
	it('ignores late native dragstart, dragend, and click events after unmount with no stale dispatch or onMapClick', async () => {
		const store = createMapStore();
		const adapter = new FakeMapAdapter();
		const target = document.createElement('div');
		document.body.appendChild(target);

		let clicked = false;
		let clickCoords: [number, number] | null = null;
		const comp = mount(MapPrimitive, {
			target,
			props: {
				store,
				adapter,
				onMapClick: (coords) => {
					clicked = true;
					clickCoords = coords;
				}
			}
		});
		await settle();

		// Keep handlers reference before unmount
		const capturedHandlers = new Map(adapter.handlers);

		let unmounted = false;
		const dispatchesAfterUnmount: MapAction[] = [];
		const originalDispatch = store.dispatch.bind(store);
		let mounted = true;
		cleanup.push(() => {
			if (mounted) unmount(comp);
			store.dispatch = originalDispatch;
			store.destroy();
			target.remove();
		});
		store.dispatch = (action: MapAction) => {
			if (unmounted) {
				dispatchesAfterUnmount.push(action);
			}
			return originalDispatch(action);
		};

		unmount(comp);
		mounted = false;
		unmounted = true;
		target.remove();
		await settle();

		// Fire late click events from captured handlers
		const clickHandlers = capturedHandlers.get('click') ?? [];
		expect(clickHandlers.length).toBeGreaterThan(0);
		for (const handler of clickHandlers) {
			handler({ lngLat: { lng: 10, lat: 20 } });
			handler({ lngLat: [10, 20] });
		}
		// Negative assertion: onMapClick must NOT be called after unmount
		expect(clicked).toBe(false);
		expect(clickCoords).toBeNull();

		// Fire late drag events from captured handlers
		const dragStartHandlers = capturedHandlers.get('dragstart') ?? [];
		expect(dragStartHandlers.length).toBeGreaterThan(0);
		for (const handler of dragStartHandlers) {
			handler();
		}

		const dragEndHandlers = capturedHandlers.get('dragend') ?? [];
		expect(dragEndHandlers.length).toBeGreaterThan(0);
		for (const handler of dragEndHandlers) {
			handler();
		}

		// Fire late moveend
		const moveEndHandlers = capturedHandlers.get('moveend') ?? [];
		for (const handler of moveEndHandlers) {
			handler();
		}

		// Negative assertion: no stale dispatches must reach the store after unmount
		expect(dispatchesAfterUnmount).toEqual([]);
	});
});
