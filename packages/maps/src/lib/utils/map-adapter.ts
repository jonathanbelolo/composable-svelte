/**
 * @file map-adapter.ts
 * @description Factory for creating map adapters
 */

import type { MapAdapter, MapProvider } from '../types/map.types';
import { MaplibreAdapter } from './maplibre-adapter';

/**
 * Create a map adapter based on the provider
 */
export function createMapAdapter(provider: MapProvider): MapAdapter {
  switch (provider) {
    case 'maplibre':
      return new MaplibreAdapter();
    case 'mapbox':
      // For now, Mapbox uses the same adapter as Maplibre (they have compatible APIs)
      // In the future, we can create a separate MapboxAdapter if needed
      return new MaplibreAdapter();
    default:
      throw new Error(`Unknown map provider: ${provider}`);
  }
}
