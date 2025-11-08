/**
 * @file maplibre-adapter.ts
 * @description Maplibre GL adapter implementing the MapAdapter interface
 */

import maplibregl from 'maplibre-gl';
import type {
  MapAdapter,
  MapInitOptions,
  LngLat,
  BBox,
  FlyToOptions,
  Marker
} from '../types/map.types';

/**
 * Maplibre GL adapter
 * Wraps Maplibre GL JS in the MapAdapter interface
 */
export class MaplibreAdapter implements MapAdapter {
  private map: maplibregl.Map | null = null;
  private markers: Map<string, maplibregl.Marker> = new Map();

  initialize(container: HTMLElement, options: MapInitOptions): void {
    this.map = new maplibregl.Map({
      container,
      style: options.style || 'https://demotiles.maplibre.org/style.json',
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
    this.map?.flyTo({
      center: options.center,
      ...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
      ...(options.bearing !== undefined ? { bearing: options.bearing } : {}),
      ...(options.pitch !== undefined ? { pitch: options.pitch } : {}),
      ...(options.duration !== undefined ? { duration: options.duration } : {}),
      ...(options.essential !== undefined ? { essential: options.essential } : {})
    });
  }

  fitBounds(bounds: BBox, padding?: number): void {
    this.map?.fitBounds(bounds, {
      padding: padding ?? 20
    });
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

    const maplibreMarker = new maplibregl.Marker({
      draggable: marker.draggable ?? false
    })
      .setLngLat(marker.position)
      .addTo(this.map);

    // Store marker reference
    this.markers.set(marker.id, maplibreMarker);

    // Add popup if specified
    if (marker.popup) {
      const popup = new maplibregl.Popup().setHTML(marker.popup.content);
      maplibreMarker.setPopup(popup);

      if (marker.popup.isOpen) {
        popup.addTo(this.map);
      }
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

    if (updates.position) {
      marker.setLngLat(updates.position);
    }

    if (updates.draggable !== undefined) {
      marker.setDraggable(updates.draggable);
    }

    if (updates.popup) {
      const popup = new maplibregl.Popup().setHTML(updates.popup.content);
      marker.setPopup(popup);

      if (updates.popup.isOpen) {
        marker.togglePopup();
      }
    }
  }

  on(event: string, handler: Function): void {
    if (!this.map) return;

    // Type-safe event handling
    this.map.on(event as any, handler as any);
  }

  off(event: string, handler: Function): void {
    if (!this.map) return;

    this.map.off(event as any, handler as any);
  }

  destroy(): void {
    // Clean up markers
    this.markers.forEach((marker) => marker.remove());
    this.markers.clear();

    // Destroy map
    this.map?.remove();
    this.map = null;
  }
}
