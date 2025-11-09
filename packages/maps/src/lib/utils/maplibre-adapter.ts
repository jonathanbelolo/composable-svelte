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
    if (!this.map) return;

    // Use flyTo for all animations - it works perfectly
    const flyToParams = {
      center: options.center,
      ...(options.zoom !== undefined ? { zoom: options.zoom } : {}),
      ...(options.bearing !== undefined ? { bearing: options.bearing } : {}),
      ...(options.pitch !== undefined ? { pitch: options.pitch } : {}),
      ...(options.duration !== undefined ? { duration: options.duration } : {}),
      ...(options.essential !== undefined ? { essential: options.essential } : {})
    };
    this.map.flyTo(flyToParams);
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

  addLayer(layer: Layer, skipStyleCheck = false): void {
    if (!this.map) {
      return;
    }

    // Wait for style to load before adding layers (skip check when retrying from styledata)
    if (!skipStyleCheck && !this.map.isStyleLoaded()) {
      this.map.once('styledata', () => {
        this.addLayer(layer, true); // Skip style check on retry
      });
      return;
    }

    // Check if source already exists (can happen on style changes)
    if (this.map.getSource(layer.id)) {
      return;
    }

    try {
      // Store layer reference
      this.layers.set(layer.id, layer);

      // Add GeoJSON source
      const sourceData = typeof layer.data === 'string' ? layer.data : layer.data;

      this.map.addSource(layer.id, {
        type: 'geojson',
        data: sourceData as any
      });

    // Add layer based on type
    if (layer.type === 'geojson') {
      // Determine geometry type for appropriate layer type
      this.map.addLayer({
        id: layer.id,
        type: 'fill', // Default to fill, can be point/line based on geometry
        source: layer.id,
        paint: {
          'fill-color': layer.style.fillColor ?? '#0080ff',
          'fill-opacity': layer.style.fillOpacity ?? 0.5
        },
        layout: {
          visibility: layer.visible ? 'visible' : 'none'
        }
      });

      // Add stroke layer if stroke is defined
      if (layer.style.strokeColor) {
        this.map.addLayer({
          id: `${layer.id}-stroke`,
          type: 'line',
          source: layer.id,
          paint: {
            'line-color': layer.style.strokeColor,
            'line-width': layer.style.strokeWidth ?? 1,
            'line-opacity': layer.style.strokeOpacity ?? 1
          },
          layout: {
            visibility: layer.visible ? 'visible' : 'none'
          }
        });
      }
    } else if (layer.type === 'heatmap') {
      // Build color gradient for heatmap
      const colorGradient = layer.style.colorGradient ?? [
        [0, 'rgba(0, 0, 255, 0)'],
        [0.5, 'rgba(0, 255, 0, 1)'],
        [1, 'rgba(255, 0, 0, 1)']
      ];

      // Flatten gradient to Maplibre format: [stop1, color1, stop2, color2, ...]
      const heatmapColor: any[] = ['interpolate', ['linear'], ['heatmap-density']];
      colorGradient.forEach(([stop, color]) => {
        heatmapColor.push(stop, color);
      });

      this.map.addLayer({
        id: layer.id,
        type: 'heatmap',
        source: layer.id,
        paint: {
          'heatmap-intensity': layer.style.intensity ?? 1,
          'heatmap-radius': layer.style.radius ?? 20,
          'heatmap-color': heatmapColor as any // Maplibre expression type is complex
        },
        layout: {
          visibility: layer.visible ? 'visible' : 'none'
        }
      });
    }
    } catch (error) {
      console.error('[MaplibreAdapter] Error adding layer:', layer.id, error);
      // Remove from layers map if addition failed
      this.layers.delete(layer.id);
      throw error;
    }
  }

  removeLayer(id: string): void {
    if (!this.map) return;

    // Remove main layer
    if (this.map.getLayer(id)) {
      this.map.removeLayer(id);
    }

    // Remove stroke layer if it exists
    if (this.map.getLayer(`${id}-stroke`)) {
      this.map.removeLayer(`${id}-stroke`);
    }

    // Remove source
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

    // Toggle main layer
    if (this.map.getLayer(id)) {
      this.map.setLayoutProperty(id, 'visibility', visibility);
    }

    // Toggle stroke layer if it exists
    if (this.map.getLayer(`${id}-stroke`)) {
      this.map.setLayoutProperty(`${id}-stroke`, 'visibility', visibility);
    }
  }

  updateLayerStyle(id: string, style: Partial<LayerStyle>): void {
    if (!this.map) return;

    const layer = this.layers.get(id);
    if (!layer) return;

    // Update layer style reference
    this.layers.set(id, {
      ...layer,
      style: { ...layer.style, ...style }
    });

    // Update Maplibre paint properties based on layer type
    if (layer.type === 'geojson') {
      // Update fill properties
      if (style.fillColor !== undefined && this.map.getLayer(id)) {
        this.map.setPaintProperty(id, 'fill-color', style.fillColor);
      }
      if (style.fillOpacity !== undefined && this.map.getLayer(id)) {
        this.map.setPaintProperty(id, 'fill-opacity', style.fillOpacity);
      }

      // Update stroke properties if stroke layer exists
      const strokeLayerId = `${id}-stroke`;
      if (this.map.getLayer(strokeLayerId)) {
        if (style.strokeColor !== undefined) {
          this.map.setPaintProperty(strokeLayerId, 'line-color', style.strokeColor);
        }
        if (style.strokeWidth !== undefined) {
          this.map.setPaintProperty(strokeLayerId, 'line-width', style.strokeWidth);
        }
        if (style.strokeOpacity !== undefined) {
          this.map.setPaintProperty(strokeLayerId, 'line-opacity', style.strokeOpacity);
        }
      }
    } else if (layer.type === 'heatmap') {
      // Update heatmap properties
      if (style.intensity !== undefined && this.map.getLayer(id)) {
        this.map.setPaintProperty(id, 'heatmap-intensity', style.intensity);
      }
      if (style.radius !== undefined && this.map.getLayer(id)) {
        this.map.setPaintProperty(id, 'heatmap-radius', style.radius);
      }
      if (style.colorGradient !== undefined && this.map.getLayer(id)) {
        // Build color gradient expression
        const heatmapColor: any[] = ['interpolate', ['linear'], ['heatmap-density']];
        style.colorGradient.forEach(([stop, color]) => {
          heatmapColor.push(stop, color);
        });
        this.map.setPaintProperty(id, 'heatmap-color', heatmapColor as any);
      }
    }
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

  changeStyle(styleURL: string): void {
    if (!this.map) return;

    // Change the map style
    this.map.setStyle(styleURL);
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
