/**
 * @file tile-providers.ts
 * @description Tile provider configurations for different map styles
 */

/**
 * Supported tile providers
 */
export type TileProvider =
  | 'openstreetmap'
  | 'stadia'
  | 'maptiler'
  | 'mapbox'
  | 'carto-light'
  | 'carto-dark'
  | 'custom';

/**
 * Tile provider configuration
 */
export interface TileProviderConfig {
  id: TileProvider;
  name: string;
  styleURL: string | ((apiKey?: string) => string);
  attribution: string;
  requiresAPIKey: boolean;
  previewURL?: string;  // Optional preview image
  description?: string;
}

/**
 * Built-in tile provider configurations
 */
export const TILE_PROVIDERS: Record<TileProvider, TileProviderConfig> = {
  'openstreetmap': {
    id: 'openstreetmap',
    name: 'OpenStreetMap',
    styleURL: 'https://demotiles.maplibre.org/style.json',
    attribution: '© OpenStreetMap contributors',
    requiresAPIKey: false,
    description: 'Free and open source map tiles from OpenStreetMap'
  },

  'stadia': {
    id: 'stadia',
    name: 'Stadia Maps (OSM Bright)',
    styleURL: 'https://tiles.stadiamaps.com/styles/osm_bright.json',
    attribution: '© Stadia Maps © OpenMapTiles © OpenStreetMap contributors',
    requiresAPIKey: false,
    description: 'Clean and bright map style from Stadia Maps'
  },

  'maptiler': {
    id: 'maptiler',
    name: 'Maptiler Streets',
    styleURL: (apiKey?: string) =>
      `https://api.maptiler.com/maps/streets/style.json${apiKey ? `?key=${apiKey}` : ''}`,
    attribution: '© MapTiler © OpenStreetMap contributors',
    requiresAPIKey: true,
    description: 'Professional map style from Maptiler (requires API key)'
  },

  'mapbox': {
    id: 'mapbox',
    name: 'Mapbox Streets',
    styleURL: 'mapbox://styles/mapbox/streets-v12',
    attribution: '© Mapbox © OpenStreetMap contributors',
    requiresAPIKey: true,
    description: 'Official Mapbox streets style (requires API key)'
  },

  'carto-light': {
    id: 'carto-light',
    name: 'Carto Light',
    styleURL: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    attribution: '© CARTO © OpenStreetMap contributors',
    requiresAPIKey: false,
    description: 'Light, minimal map style from CARTO'
  },

  'carto-dark': {
    id: 'carto-dark',
    name: 'Carto Dark',
    styleURL: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    attribution: '© CARTO © OpenStreetMap contributors',
    requiresAPIKey: false,
    description: 'Dark theme map style from CARTO'
  },

  'custom': {
    id: 'custom',
    name: 'Custom',
    styleURL: '',
    attribution: '',
    requiresAPIKey: false,
    description: 'User-provided custom tile URL'
  }
};

/**
 * Get tile provider configuration
 */
export function getTileProviderConfig(provider: TileProvider): TileProviderConfig {
  return TILE_PROVIDERS[provider];
}

/**
 * Get style URL for a provider
 */
export function getStyleURL(
  provider: TileProvider,
  apiKey?: string,
  customURL?: string
): string {
  if (provider === 'custom' && customURL) {
    return customURL;
  }

  const config = TILE_PROVIDERS[provider];
  if (typeof config.styleURL === 'function') {
    return config.styleURL(apiKey);
  }
  return config.styleURL;
}

/**
 * Get all available tile providers
 */
export function getAvailableTileProviders(): TileProviderConfig[] {
  return Object.values(TILE_PROVIDERS).filter(p => p.id !== 'custom');
}

/**
 * Check if provider requires API key
 */
export function requiresAPIKey(provider: TileProvider): boolean {
  return TILE_PROVIDERS[provider].requiresAPIKey;
}
