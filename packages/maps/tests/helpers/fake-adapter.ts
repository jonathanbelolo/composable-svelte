/**
 * A `MapAdapter` that records instead of rendering.
 *
 * `MapPrimitive` had no test at all, and the reason was structural rather than
 * neglect: it constructed its own adapter, so mounting it meant constructing a
 * real MapLibre map, which needs a WebGL context jsdom does not have. There was
 * no seam. Making the adapter injectable is what opens one, and this is the
 * thing that goes through it.
 *
 * Deliberately a recorder rather than a mock library: the assertions in the
 * tests are about *what the component asked the map to do*, in order, and a
 * plain array of calls says that more legibly than matcher chains.
 */

import type {
	MapAdapter,
	MapInitOptions,
	LngLat,
	BBox,
	FlyToOptions,
	Marker,
	Layer,
	LayerStyle,
	Popup
} from '../../src/lib/types/map.types.js';

export interface RecordedCall {
	method: string;
	args: unknown[];
}

export class FakeMapAdapter implements MapAdapter {
	/** Every call the component made, in order. */
	readonly calls: RecordedCall[] = [];
	/** Event name -> handlers the component registered. */
	readonly handlers = new Map<string, Function[]>();

	private center: LngLat = [0, 0];
	private zoom = 0;
	private bearing = 0;
	private pitch = 0;

	/** `true` once `initialize` has run — the non-vacuity check for every test. */
	initialized = false;

	private record(method: string, ...args: unknown[]) {
		this.calls.push({ method, args });
	}

	/** Calls of one kind, for asserting without indexing into a shared array. */
	callsTo(method: string): RecordedCall[] {
		return this.calls.filter((call) => call.method === method);
	}

	/** Drive an event the way the map would, so handler wiring can be observed. */
	emit(event: string, payload?: unknown): void {
		for (const handler of this.handlers.get(event) ?? []) handler(payload);
	}

	initialize(container: HTMLElement, options: MapInitOptions): void {
		this.record('initialize', container, options);
		this.initialized = true;
		this.center = options.center;
		this.zoom = options.zoom;
		this.bearing = options.bearing ?? 0;
		this.pitch = options.pitch ?? 0;
	}

	setCenter(center: LngLat): void {
		this.record('setCenter', center);
		this.center = center;
	}
	setZoom(zoom: number): void {
		this.record('setZoom', zoom);
		this.zoom = zoom;
	}
	setBearing(bearing: number): void {
		this.record('setBearing', bearing);
		this.bearing = bearing;
	}
	setPitch(pitch: number): void {
		this.record('setPitch', pitch);
		this.pitch = pitch;
	}
	flyTo(options: FlyToOptions): void {
		this.record('flyTo', options);
	}
	fitBounds(bounds: BBox, padding?: number): void {
		this.record('fitBounds', bounds, padding);
	}

	getCenter(): LngLat {
		return this.center;
	}
	getZoom(): number {
		return this.zoom;
	}
	getBearing(): number {
		return this.bearing;
	}
	getPitch(): number {
		return this.pitch;
	}

	addMarker(marker: Marker): void {
		this.record('addMarker', marker);
	}
	removeMarker(id: string): void {
		this.record('removeMarker', id);
	}
	updateMarker(id: string, updates: Partial<Marker>): void {
		this.record('updateMarker', id, updates);
	}
	addLayer(layer: Layer): void {
		this.record('addLayer', layer);
	}
	removeLayer(id: string): void {
		this.record('removeLayer', id);
	}
	toggleLayerVisibility(id: string): void {
		this.record('toggleLayerVisibility', id);
	}
	updateLayerStyle(id: string, style: Partial<LayerStyle>): void {
		this.record('updateLayerStyle', id, style);
	}
	openPopup(popup: Popup): void {
		this.record('openPopup', popup);
	}
	closePopup(id: string): void {
		this.record('closePopup', id);
	}
	changeStyle(styleURL: string): void {
		this.record('changeStyle', styleURL);
	}

	on(event: string, handler: Function): void {
		this.record('on', event);
		const existing = this.handlers.get(event) ?? [];
		existing.push(handler);
		this.handlers.set(event, existing);
	}
	off(event: string, handler: Function): void {
		this.record('off', event);
		const existing = this.handlers.get(event) ?? [];
		this.handlers.set(
			event,
			existing.filter((h) => h !== handler)
		);
	}
	destroy(): void {
		this.record('destroy');
		this.initialized = false;
	}
}
