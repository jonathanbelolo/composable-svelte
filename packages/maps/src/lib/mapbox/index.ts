/**
 * @file mapbox/index.ts
 * @description Mapbox GL adapter, behind its own entry point.
 *
 * ```ts
 * import { Map } from '@composable-svelte/maps';
 * import { MapboxAdapter } from '@composable-svelte/maps/mapbox';
 * ```
 *
 * **This module is not reachable from the package root, and that is
 * deliberate.** `mapbox-gl` is an *optional* peer dependency: most consumers
 * never install it, and a static import of it from the main barrel would break
 * `import { Map } from '@composable-svelte/maps'` for every one of them. That
 * exact failure is on this repo's record — `chat` shipped it once, statically
 * importing its own optional peer — so the separation is enforced by the
 * package's `exports` map rather than left to discipline.
 *
 * **Licensing is the consumer's to accept.** `mapbox-gl` v2 and later are
 * distributed under the Mapbox Terms of Service, "for use only with the
 * relevant Mapbox product(s)", and require an active Mapbox account. Installing
 * it is therefore an explicit act, not something this package does on anyone's
 * behalf. It was previously an `optionalDependency` — which installs by default
 * — so every consumer received it and nothing ever imported it.
 *
 * The map behaviour is MapLibre's, because the two SDKs descend from one
 * codebase and take the same style spec. Everything genuinely shared lives in
 * `../utils/layer-spec.js`; what differs is the constructor, the access token,
 * and the stylesheet.
 */

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { geojsonSource, layerSpecs, paintUpdates, strokeLayerId } from '../utils/layer-spec.js';
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
} from '../types/map.types.js';

/**
 * Drives a Mapbox GL map through this package's `MapAdapter` interface.
 *
 * Pass it to `<Map>` or `<MapPrimitive>` with the `adapter` prop. The access
 * token comes from `MapState.accessToken`, which `MapPrimitive` forwards into
 * `initialize` — a field that existed and was **read by nothing** until this
 * adapter, because MapLibre has no token concept and quietly ignored it.
 */
export class MapboxAdapter implements MapAdapter {
	private map: mapboxgl.Map | null = null;
	private markers: globalThis.Map<string, mapboxgl.Marker> = new globalThis.Map();
	private layers: globalThis.Map<string, Layer> = new globalThis.Map();
	private popups: globalThis.Map<string, mapboxgl.Popup> = new globalThis.Map();

	initialize(container: HTMLElement, options: MapInitOptions): void {
		if (!options.accessToken) {
			// Loud, and early. Mapbox fails an unauthenticated style request with a
			// 401 buried in a network panel, which reads as "the map is broken"
			// rather than "you did not supply a token".
			throw new Error(
				'[MapboxAdapter] Mapbox requires an access token. Pass `accessToken` to ' +
					'createInitialMapState, or use MaplibreAdapter, which needs none.'
			);
		}

		this.map = new mapboxgl.Map({
			container,
			accessToken: options.accessToken,
			style: options.style || 'mapbox://styles/mapbox/streets-v12',
			center: options.center,
			zoom: options.zoom,
			bearing: options.bearing ?? 0,
			pitch: options.pitch ?? 0,
			interactive: options.interactive ?? true
		});
	}

	setCenter(center: LngLat): void {
		this.map?.setCenter(center);
	}

	setZoom(zoom: number): void {
		this.map?.setZoom(zoom);
	}

	setBearing(bearing: number): void {
		this.map?.setBearing(bearing);
	}

	setPitch(pitch: number): void {
		this.map?.setPitch(pitch);
	}

	flyTo(options: FlyToOptions): void {
		if (!this.map) return;

		this.map.flyTo({
			center: options.center,
			...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
			...(options.bearing !== undefined ? { bearing: options.bearing } : {}),
			...(options.pitch !== undefined ? { pitch: options.pitch } : {}),
			...(options.duration !== undefined ? { duration: options.duration } : {}),
			...(options.essential !== undefined ? { essential: options.essential } : {})
		});
	}

	fitBounds(bounds: BBox, padding?: number): void {
		this.map?.fitBounds(bounds, { padding: padding ?? 20 });
	}

	getCenter(): LngLat {
		const center = this.map?.getCenter();
		return center ? [center.lng, center.lat] : [0, 0];
	}

	getZoom(): number {
		return this.map?.getZoom() ?? 0;
	}

	getBearing(): number {
		return this.map?.getBearing() ?? 0;
	}

	getPitch(): number {
		return this.map?.getPitch() ?? 0;
	}

	addMarker(marker: Marker): void {
		if (!this.map) return;

		const mapboxMarker = new mapboxgl.Marker({ draggable: marker.draggable ?? false })
			.setLngLat(marker.position)
			.addTo(this.map);

		this.markers.set(marker.id, mapboxMarker);

		if (marker.popup) {
			const popup = new mapboxgl.Popup().setHTML(marker.popup.content);
			mapboxMarker.setPopup(popup);
			if (marker.popup.isOpen) popup.addTo(this.map);
		}
	}

	removeMarker(id: string): void {
		const marker = this.markers.get(id);
		if (marker) {
			marker.remove();
			this.markers.delete(id);
		}
	}

	updateMarker(id: string, updates: Partial<Marker>): void {
		const marker = this.markers.get(id);
		if (!marker) return;

		if (updates.position) marker.setLngLat(updates.position);
		if (updates.draggable !== undefined) marker.setDraggable(updates.draggable);
		if (updates.popup) {
			const popup = new mapboxgl.Popup().setHTML(updates.popup.content);
			marker.setPopup(popup);
			if (updates.popup.isOpen) marker.togglePopup();
		}
	}

	addLayer(layer: Layer, skipStyleCheck = false): void {
		if (!this.map) return;

		// Layers cannot be added before the style is loaded; retry once it is.
		if (!skipStyleCheck && !this.map.isStyleLoaded()) {
			this.map.once('styledata', () => this.addLayer(layer, true));
			return;
		}

		if (this.map.getSource(layer.id)) return;

		try {
			this.layers.set(layer.id, layer);
			this.map.addSource(layer.id, geojsonSource(layer) as never);
			for (const spec of layerSpecs(layer)) {
				this.map.addLayer(spec as never);
			}
		} catch (error) {
			console.error('[MapboxAdapter] Error adding layer:', layer.id, error);
			this.layers.delete(layer.id);
			throw error;
		}
	}

	removeLayer(id: string): void {
		if (!this.map) return;

		if (this.map.getLayer(id)) this.map.removeLayer(id);
		if (this.map.getLayer(strokeLayerId(id))) this.map.removeLayer(strokeLayerId(id));
		if (this.map.getSource(id)) this.map.removeSource(id);

		this.layers.delete(id);
	}

	toggleLayerVisibility(id: string): void {
		if (!this.map) return;

		const layer = this.layers.get(id);
		if (!layer) return;

		const visibility = layer.visible ? 'visible' : 'none';
		if (this.map.getLayer(id)) this.map.setLayoutProperty(id, 'visibility', visibility);
		if (this.map.getLayer(strokeLayerId(id))) {
			this.map.setLayoutProperty(strokeLayerId(id), 'visibility', visibility);
		}
	}

	updateLayerStyle(id: string, style: Partial<LayerStyle>): void {
		if (!this.map) return;

		const layer = this.layers.get(id);
		if (!layer) return;

		const updated = { ...layer, style: { ...layer.style, ...style } };
		this.layers.set(id, updated);

		for (const { layerId, property, value } of paintUpdates(updated, style)) {
			if (this.map.getLayer(layerId)) {
				// Mapbox types the property name as a literal union of every paint
				// key in the style spec, which nothing computed at runtime can
				// satisfy. The names come from `paintUpdates`, which is a closed
				// set of seven and is tested against each layer type — so the
				// guarantee is real, it just is not expressible here.
				this.map.setPaintProperty(layerId, property as never, value as never);
			}
		}
	}

	openPopup(popup: Popup): void {
		if (!this.map) return;

		const mapboxPopup = new mapboxgl.Popup({
			closeButton: popup.closeButton ?? true,
			closeOnClick: popup.closeOnClick ?? false
		})
			.setLngLat(popup.position)
			.setHTML(popup.content)
			.addTo(this.map);

		this.popups.set(popup.id, mapboxPopup);
	}

	closePopup(id: string): void {
		const popup = this.popups.get(id);
		if (popup) {
			popup.remove();
			this.popups.delete(id);
		}
	}

	changeStyle(styleURL: string): void {
		this.map?.setStyle(styleURL);
	}

	on(event: string, handler: Function): void {
		this.map?.on(event as never, handler as never);
	}

	off(event: string, handler: Function): void {
		this.map?.off(event as never, handler as never);
	}

	destroy(): void {
		this.markers.forEach((marker) => marker.remove());
		this.markers.clear();

		this.popups.forEach((popup) => popup.remove());
		this.popups.clear();

		this.layers.forEach((layer) => {
			if (this.map?.getLayer(layer.id)) this.map.removeLayer(layer.id);
			if (this.map?.getSource(layer.id)) this.map.removeSource(layer.id);
		});
		this.layers.clear();

		this.map?.remove();
		this.map = null;
	}
}
