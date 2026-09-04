/**
 * `MapboxAdapter`, tested against the real types and a faked runtime.
 *
 * `mapbox-gl` is installed as a devDependency here precisely so the adapter is
 * typechecked against Mapbox's own declarations rather than against a
 * hand-written approximation — a signature written from memory is a guess, and
 * this campaign has already produced a *corrected* signature that was also
 * wrong. What is faked is the constructor: a real `mapboxgl.Map` wants a WebGL
 * context jsdom has not got, and an access token nobody should need to run a
 * test suite.
 *
 * Consumers do not get `mapbox-gl` — it is an optional peer, and this module is
 * behind its own entry point so the package root never imports it. That
 * separation is asserted in `tests/consumer-install.test.ts`, not here.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/** A recording stand-in for a Mapbox map, popup and marker. */
const calls: Array<{ method: string; args: unknown[] }> = [];
const record = (method: string) => (...args: unknown[]) => {
	calls.push({ method, args });
	return undefined;
};

const existingLayers = new Set<string>();
const existingSources = new Set<string>();

class FakeMap {
	constructor(public options: Record<string, unknown>) {
		calls.push({ method: 'construct', args: [options] });
	}
	isStyleLoaded = () => true;
	getSource = (id: string) => (existingSources.has(id) ? {} : undefined);
	getLayer = (id: string) => (existingLayers.has(id) ? {} : undefined);
	addSource = (id: string, spec: unknown) => {
		existingSources.add(id);
		calls.push({ method: 'addSource', args: [id, spec] });
	};
	addLayer = (spec: { id: string }) => {
		existingLayers.add(spec.id);
		calls.push({ method: 'addLayer', args: [spec] });
	};
	removeLayer = (id: string) => {
		existingLayers.delete(id);
		calls.push({ method: 'removeLayer', args: [id] });
	};
	removeSource = (id: string) => {
		existingSources.delete(id);
		calls.push({ method: 'removeSource', args: [id] });
	};
	setPaintProperty = record('setPaintProperty');
	setLayoutProperty = record('setLayoutProperty');
	setStyle = record('setStyle');
	setCenter = record('setCenter');
	setZoom = record('setZoom');
	once = record('once');
	on = record('on');
	off = record('off');
	remove = record('remove');
	getCenter = () => ({ lng: 1, lat: 2 });
	getZoom = () => 7;
	getBearing = () => 0;
	getPitch = () => 0;
}

vi.mock('mapbox-gl', () => {
	class FakeMarker {
		setLngLat = () => this;
		addTo = () => this;
		setPopup = () => this;
		setDraggable = record('markerSetDraggable');
		togglePopup = record('markerTogglePopup');
		remove = record('markerRemove');
	}
	class FakePopup {
		setLngLat = () => this;
		setHTML = () => this;
		addTo = () => this;
		remove = record('popupRemove');
	}
	return { default: { Map: FakeMap, Marker: FakeMarker, Popup: FakePopup } };
});

// Imported after the mock is declared; `vi.mock` is hoisted, so this resolves
// to the fake at runtime and to Mapbox's real types at compile time.
const { MapboxAdapter } = await import('../src/lib/mapbox/index');

const container = () => document.createElement('div');
const options = (overrides: Record<string, unknown> = {}) => ({
	center: [4.9, 52.4] as [number, number],
	zoom: 10,
	style: 'mapbox://styles/mapbox/streets-v12',
	accessToken: 'pk.test-token',
	...overrides
});

const callsTo = (method: string) => calls.filter((c) => c.method === method);

beforeEach(() => {
	calls.length = 0;
	existingLayers.clear();
	existingSources.clear();
});

describe('the access token', () => {
	it('reaches the map', () => {
		// `MapInitOptions.accessToken` existed from the beginning and was read by
		// nothing: MapPrimitive forwarded it and MaplibreAdapter dropped it,
		// because MapLibre has no token concept. This adapter is what makes the
		// field mean something.
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());

		const [construct] = callsTo('construct');
		expect(construct).toBeDefined();
		expect((construct!.args[0] as Record<string, unknown>).accessToken).toBe('pk.test-token');
	});

	it('is required, and says so', () => {
		// Mapbox answers an unauthenticated style request with a 401 buried in a
		// network panel, which reads as "the map is broken" rather than "you did
		// not supply a token".
		const adapter = new MapboxAdapter();
		expect(() => adapter.initialize(container(), options({ accessToken: undefined }))).toThrow(
			/access token/i
		);
	});

	it('constructs nothing when the token is missing', () => {
		const adapter = new MapboxAdapter();
		try {
			adapter.initialize(container(), options({ accessToken: undefined }));
		} catch {
			/* expected */
		}
		expect(callsTo('construct')).toEqual([]);
	});
});

describe('initialisation carries the viewport', () => {
	it('passes centre, zoom, bearing and pitch', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options({ bearing: 45, pitch: 30 }));

		const opts = callsTo('construct')[0]!.args[0] as Record<string, unknown>;
		expect(opts.center).toEqual([4.9, 52.4]);
		expect(opts.zoom).toBe(10);
		expect(opts.bearing).toBe(45);
		expect(opts.pitch).toBe(30);
	});

	it('defaults bearing and pitch rather than passing undefined', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());

		const opts = callsTo('construct')[0]!.args[0] as Record<string, unknown>;
		expect(opts.bearing).toBe(0);
		expect(opts.pitch).toBe(0);
	});
});

describe('layers go through the shared translation', () => {
	const layer = {
		id: 'shapes',
		type: 'geojson' as const,
		data: { type: 'FeatureCollection', features: [] } as never,
		style: { fillColor: '#abc', strokeColor: '#000' },
		visible: true,
		interactive: true
	};

	it('adds the source and both layers a stroked polygon needs', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());
		adapter.addLayer(layer);

		expect(callsTo('addSource').length).toBe(1);
		// Two GL layers from one Layer, fill then line — the property
		// `layer-spec.test.ts` pins, asserted here as reaching the SDK.
		expect(callsTo('addLayer').map((c) => (c.args[0] as { type: string }).type)).toEqual([
			'fill',
			'line'
		]);
	});

	it('sends a style patch to the right layer', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());
		adapter.addLayer(layer);
		calls.length = 0;

		adapter.updateLayerStyle('shapes', { strokeWidth: 6 });

		expect(callsTo('setPaintProperty')).toEqual([
			{ method: 'setPaintProperty', args: ['shapes-stroke', 'line-width', 6] }
		]);
	});

	it('removes the stroke layer along with the fill', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());
		adapter.addLayer(layer);
		calls.length = 0;

		adapter.removeLayer('shapes');

		expect(callsTo('removeLayer').map((c) => c.args[0])).toEqual(['shapes', 'shapes-stroke']);
		expect(callsTo('removeSource').map((c) => c.args[0])).toEqual(['shapes']);
	});
});

describe('teardown', () => {
	it('removes the map', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());
		adapter.destroy();

		expect(callsTo('remove').length).toBe(1);
	});

	it('removes markers it created', () => {
		const adapter = new MapboxAdapter();
		adapter.initialize(container(), options());
		adapter.addMarker({ id: 'm1', position: [0, 0] });
		adapter.destroy();

		expect(callsTo('markerRemove').length).toBe(1);
	});
});
