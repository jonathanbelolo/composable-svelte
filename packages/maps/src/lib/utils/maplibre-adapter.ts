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
  Marker,
  Layer,
  LayerStyle,
  Popup
} from '../types/map.types';

/**
 * Maplibre GL adapter
 * Wraps Maplibre GL JS in the MapAdapter interface
 */
export class MaplibreAdapter implements MapAdapter {
  private map: maplibregl.Map | null = null;
  private markers: Map<string, maplibregl.Marker> = new Map();
  private layers: Map<string, Layer> = new Map();
  private popups: Map<string, maplibregl.Popup> = new Map();

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

  addLayer(layer: Layer): void {
    if (!this.map) return;

    // Store layer reference
    this.layers.set(layer.id, layer);

    // TODO: Implement full layer rendering
    // For now, this is a placeholder for Phase 12B
    console.log(`Layer ${layer.id} added (implementation pending)`);
  }

  removeLayer(id: string): void {
    if (!this.map) return;

    if (this.map.getLayer(id)) {
      this.map.removeLayer(id);
    }
    if (this.map.getSource(id)) {
      this.map.removeSource(id);
    }
    this.layers.delete(id);
  }

  toggleLayerVisibility(id: string): void {
    if (!this.map) return;

    const layer = this.layers.get(id);
    if (!layer) return;

    const visibility = layer.visible ? 'visible' : 'none';
    if (this.map.getLayer(id)) {
      this.map.setLayoutProperty(id, 'visibility', visibility);
    }
  }

  updateLayerStyle(id: string, style: Partial<LayerStyle>): void {
    if (!this.map) return;

    // TODO: Implement style updates
    // This requires mapping LayerStyle to Maplibre paint properties
    console.log(`Layer ${id} style updated (implementation pending)`, style);
  }

  openPopup(popup: Popup): void {
    if (!this.map) return;

    const maplibrePopup = new maplibregl.Popup({
      closeButton: popup.closeButton ?? true,
      closeOnClick: popup.closeOnClick ?? false
    })
      .setLngLat(popup.position)
      .setHTML(popup.content)
      .addTo(this.map);

    this.popups.set(popup.id, maplibrePopup);
  }

  closePopup(id: string): void {
    const popup = this.popups.get(id);
    if (popup) {
      popup.remove();
      this.popups.delete(id);
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

    // Clean up popups
    this.popups.forEach((popup) => popup.remove());
    this.popups.clear();

    // Clean up layers
    this.layers.forEach((layer) => {
      if (this.map?.getLayer(layer.id)) {
        this.map.removeLayer(layer.id);
      }
      if (this.map?.getSource(layer.id)) {
        this.map.removeSource(layer.id);
      }
    });
    this.layers.clear();

    // Destroy map
    this.map?.remove();
    this.map = null;
  }
}
