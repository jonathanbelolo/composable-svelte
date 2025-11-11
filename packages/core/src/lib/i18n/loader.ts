/**
 * Translation loader implementations with cache support.
 *
 * @module i18n/loader
 */

import type { TranslationLoader, TranslationNamespace } from './types.js';

/**
 * Cache entry with timestamp for TTL management.
 */
interface CacheEntry {
  translations: TranslationNamespace;
  timestamp: number;
}

/**
 * Get cache lifetime based on environment.
 * - Development: 0ms (no caching for hot reload)
 * - Production: 1 hour
 */
function getCacheLifetime(): number {
  return import.meta.env.DEV ? 0 : 60 * 60 * 1000; // 0ms dev, 1hr prod
}

/**
 * Fetch-based translation loader for client-side.
 *
 * Features:
 * - Memory cache with TTL (0ms dev, 1hr prod)
 * - Cache invalidation support for hot reload
 * - Concurrent request deduplication
 * - Proper error handling
 *
 * @example
 * ```typescript
 * const loader = new FetchTranslationLoader({
 *   baseUrl: '/locales',
 *   supportedLocales: ['en', 'pt-BR', 'es']
 * });
 *
 * const translations = await loader.load('common', 'pt-BR');
 * ```
 */
export class FetchTranslationLoader implements TranslationLoader {
  private cache = new Map<string, CacheEntry>();
  private inflightRequests = new Map<string, Promise<TranslationNamespace | null>>();
  private baseUrl: string;
  private supportedLocales: string[];

  constructor(config: { baseUrl: string; supportedLocales: string[] }) {
    this.baseUrl = config.baseUrl;
    this.supportedLocales = config.supportedLocales;
  }

  /**
   * Load a translation namespace for a locale.
   * Returns null if namespace doesn't exist.
   */
  async load(namespace: string, locale: string): Promise<TranslationNamespace | null> {
    const cacheKey = `${locale}:${namespace}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < getCacheLifetime()) {
        return cached.translations;
      }
      // Cache expired, remove it
      this.cache.delete(cacheKey);
    }

    // Check if request is already in flight
    const inflight = this.inflightRequests.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    // Start new request
    const request = this._fetchTranslations(namespace, locale);
    this.inflightRequests.set(cacheKey, request);

    try {
      const translations = await request;
      if (translations) {
        // Cache successful result
        this.cache.set(cacheKey, {
          translations,
          timestamp: Date.now()
        });
      }
      return translations;
    } finally {
      // Clean up inflight request
      this.inflightRequests.delete(cacheKey);
    }
  }

  /**
   * Preload multiple namespaces in parallel.
   */
  async preload(namespaces: string[], locale: string): Promise<void> {
    await Promise.all(namespaces.map((ns) => this.load(ns, locale)));
  }

  /**
   * Invalidate cache for hot reload support.
   * Can invalidate specific namespace or all namespaces for a locale.
   */
  invalidate(locale?: string, namespace?: string): void {
    if (locale && namespace) {
      // Invalidate specific namespace
      this.cache.delete(`${locale}:${namespace}`);
    } else if (locale) {
      // Invalidate all namespaces for locale
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${locale}:`)) {
          this.cache.delete(key);
        }
      }
    } else {
      // Invalidate all caches
      this.cache.clear();
    }
  }

  /**
   * Fetch translations from server.
   */
  private async _fetchTranslations(
    namespace: string,
    locale: string
  ): Promise<TranslationNamespace | null> {
    try {
      const url = `${this.baseUrl}/${locale}/${namespace}.json`;
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          // Namespace doesn't exist for this locale
          return null;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const translations = await response.json();
      return translations as TranslationNamespace;
    } catch (error) {
      console.error(`[i18n] Failed to load ${namespace} for ${locale}:`, error);
      return null;
    }
  }
}

/**
 * Bundled translation loader for SSR.
 *
 * Uses static imports for bundler compatibility.
 * All translations are bundled with the application.
 *
 * @example
 * ```typescript
 * import enCommon from '../locales/en/common.json';
 * import ptBRCommon from '../locales/pt-BR/common.json';
 *
 * const loader = new BundledTranslationLoader({
 *   bundles: {
 *     'en': { common: enCommon },
 *     'pt-BR': { common: ptBRCommon }
 *   }
 * });
 * ```
 */
export class BundledTranslationLoader implements TranslationLoader {
  private bundles: Record<string, Record<string, TranslationNamespace>>;

  constructor(config: { bundles: Record<string, Record<string, TranslationNamespace>> }) {
    this.bundles = config.bundles;
  }

  /**
   * Load a translation namespace for a locale.
   * Returns null if namespace doesn't exist.
   */
  async load(namespace: string, locale: string): Promise<TranslationNamespace | null> {
    const localeBundle = this.bundles[locale];
    if (!localeBundle) {
      console.warn(`[i18n] No bundles found for locale: ${locale}`);
      return null;
    }

    const translations = localeBundle[namespace];
    if (!translations) {
      console.warn(`[i18n] Namespace ${namespace} not found for locale ${locale}`);
      return null;
    }

    return translations;
  }

  /**
   * Preload multiple namespaces in parallel.
   * For bundled loader, this is a no-op since all translations are already loaded.
   */
  async preload(namespaces: string[], locale: string): Promise<void> {
    // No-op: all translations already bundled
  }
}

/**
 * Create a lazy translation loader using import.meta.glob.
 *
 * This is an alternative to BundledTranslationLoader that works with Vite's
 * glob imports for better tree-shaking.
 *
 * @example
 * ```typescript
 * const translationModules = import.meta.glob('../locales/**\/*.json');
 * const loader = createGlobLoader(translationModules, ['en', 'pt-BR', 'es']);
 * ```
 */
export function createGlobLoader(
  modules: Record<string, () => Promise<any>>,
  supportedLocales: string[]
): TranslationLoader {
  const cache = new Map<string, TranslationNamespace>();

  return {
    async load(namespace: string, locale: string): Promise<TranslationNamespace | null> {
      const cacheKey = `${locale}:${namespace}`;

      // Check cache
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey)!;
      }

      // Try to find matching module
      const modulePath = `../locales/${locale}/${namespace}.json`;
      const moduleLoader = modules[modulePath];

      if (!moduleLoader) {
        console.warn(`[i18n] Module not found: ${modulePath}`);
        return null;
      }

      try {
        const module = await moduleLoader();
        const translations = module.default as TranslationNamespace;
        cache.set(cacheKey, translations);
        return translations;
      } catch (error) {
        console.error(`[i18n] Failed to load module ${modulePath}:`, error);
        return null;
      }
    },

    async preload(namespaces: string[], locale: string): Promise<void> {
      await Promise.all(namespaces.map((ns) => this.load(ns, locale)));
    }
  };
}
