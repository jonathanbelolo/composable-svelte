/**
 * Server-side rendering (SSR) utilities for i18n.
 *
 * Provides helpers for SvelteKit integration with zero-FOIT (Flash Of Incorrect Translation):
 * - Server detects user's locale from headers/cookies
 * - Server pre-renders with correct language
 * - Client hydrates seamlessly without language flash
 *
 * @module i18n/ssr
 *
 * @example SvelteKit +page.server.ts
 * ```typescript
 * import { initI18nOnServer } from '@composable-svelte/core/i18n/ssr';
 * import enCommon from '$lib/locales/en/common.json';
 * import ptBRCommon from '$lib/locales/pt-BR/common.json';
 *
 * export async function load({ request, url }) {
 *   const i18nData = await initI18nOnServer({
 *     request,
 *     url: url.toString(),
 *     supportedLocales: ['en', 'pt-BR'],
 *     defaultLocale: 'en',
 *     bundles: {
 *       'en': { common: enCommon },
 *       'pt-BR': { common: ptBRCommon }
 *     },
 *     preloadNamespaces: ['common']
 *   });
 *
 *   return { i18nData };
 * }
 * ```
 *
 * @example SvelteKit +page.svelte
 * ```svelte
 * <script lang="ts">
 *   import { hydrateI18nOnClient } from '@composable-svelte/core/i18n/ssr';
 *   import { onMount } from 'svelte';
 *
 *   let { data } = $props();
 *
 *   onMount(() => {
 *     hydrateI18nOnClient(store, data.i18nData);
 *   });
 * </script>
 * ```
 */

import type {
  I18nState,
  I18nDependencies,
  TranslationNamespace,
  LocaleDetector
} from './types.js';
import {
  createInitialI18nState,
  i18nReducer
} from './reducer.js';
import {
  createSSRLocaleDetector,
  createStaticLocaleDetector
} from './detector.js';
import {
  BundledTranslationLoader
} from './loader.js';
import {
  serverDOM
} from './types.js';
import { Effect } from '../effect.js';

/**
 * Configuration for server-side i18n initialization.
 */
export interface SSRConfig {
  /** SvelteKit Request object */
  request: Request;

  /** Full URL (for query param detection) */
  url: string;

  /** Supported locales */
  supportedLocales: string[];

  /** Default fallback locale */
  defaultLocale: string;

  /**
   * Translation bundles (statically imported).
   * Format: { 'en': { common: {...}, products: {...} }, 'pt-BR': {...} }
   */
  bundles: Record<string, Record<string, TranslationNamespace>>;

  /**
   * Namespaces to preload on server.
   * These will be available immediately on page load.
   */
  preloadNamespaces?: string[];

  /**
   * Optional custom locale detector.
   * If not provided, uses createSSRLocaleDetector with request headers.
   */
  localeDetector?: LocaleDetector;

  /**
   * Optional cookie name for locale persistence.
   * Defaults to 'locale'.
   */
  cookieName?: string;

  /**
   * Optional URL parameter name for locale override.
   * Defaults to 'lang'.
   */
  urlParam?: string;
}

/**
 * Serializable i18n data for SSR hydration.
 *
 * This is what gets passed from server to client.
 * All fields must be JSON-serializable.
 */
export interface I18nSSRData {
  /** Detected locale */
  locale: string;

  /** Initial i18n state (JSON-serializable) */
  state: I18nState;

  /** Preloaded translations */
  translations: Record<string, TranslationNamespace>;
}

/**
 * Initialize i18n on the server.
 *
 * This function:
 * 1. Detects user's locale from request
 * 2. Creates initial i18n state
 * 3. Preloads critical namespaces
 * 4. Returns serializable data for hydration
 *
 * @example
 * ```typescript
 * // In SvelteKit +page.server.ts
 * export async function load({ request, url }) {
 *   const i18nData = await initI18nOnServer({
 *     request,
 *     url: url.toString(),
 *     supportedLocales: ['en', 'pt-BR'],
 *     defaultLocale: 'en',
 *     bundles: {
 *       'en': { common: enCommon },
 *       'pt-BR': { common: ptBRCommon }
 *     },
 *     preloadNamespaces: ['common']
 *   });
 *
 *   return { i18nData };
 * }
 * ```
 */
export async function initI18nOnServer(config: SSRConfig): Promise<I18nSSRData> {
  const {
    request,
    url,
    supportedLocales,
    defaultLocale,
    bundles,
    preloadNamespaces = [],
    cookieName = 'locale',
    urlParam = 'lang'
  } = config;

  // Detect locale from request
  const detector = config.localeDetector ?? createSSRLocaleDetector({
    supportedLocales,
    defaultLocale,
    url,
    cookies: request.headers.get('cookie') ?? '',
    acceptLanguage: request.headers.get('accept-language') ?? '',
    cookieName,
    urlParam
  });

  const locale = detector.detect();

  // Create initial state
  let state = createInitialI18nState(locale, supportedLocales, defaultLocale);

  // Create dependencies for server
  const translationLoader = new BundledTranslationLoader({ bundles });
  const deps: I18nDependencies = {
    translationLoader,
    localeDetector: detector,
    storage: createServerStorage(), // SSR-safe storage mock
    dom: serverDOM
  };

  // Preload namespaces
  const translations: Record<string, TranslationNamespace> = {};

  for (const namespace of preloadNamespaces) {
    const loaded = await translationLoader.load(namespace, locale);
    if (loaded) {
      const cacheKey = `${locale}:${namespace}`;
      translations[cacheKey] = loaded;

      // Update state with loaded translations
      state = {
        ...state,
        translations: {
          ...state.translations,
          [cacheKey]: loaded
        }
      };
    }
  }

  return {
    locale,
    state,
    translations
  };
}

/**
 * Hydrate i18n on the client.
 *
 * This function restores the server-rendered i18n state on the client,
 * ensuring zero-FOIT (Flash Of Incorrect Translation).
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { hydrateI18nOnClient } from '@composable-svelte/core/i18n/ssr';
 *   import { onMount } from 'svelte';
 *
 *   let { data } = $props();
 *
 *   onMount(() => {
 *     // Hydrate with server state
 *     hydrateI18nOnClient(store, data.i18nData);
 *
 *     // Now safe to use client-side features (FetchTranslationLoader, etc.)
 *     store.dispatch({
 *       type: 'i18n/loadNamespace',
 *       namespace: 'products',
 *       locale: data.i18nData.locale
 *     });
 *   });
 * </script>
 * ```
 */
export function hydrateI18nOnClient<S extends { i18n: I18nState }, A>(
  store: { state: S; dispatch: (action: A) => void },
  ssrData: I18nSSRData
): void {
  // Merge SSR state with current store state
  const currentState = store.state;
  const newState = {
    ...currentState,
    i18n: {
      ...ssrData.state,
      // Preserve any client-side state that may have been set during hydration
      translations: {
        ...currentState.i18n?.translations,
        ...ssrData.state.translations
      }
    }
  };

  // Note: This assumes the store has a way to replace state
  // In practice, you'd dispatch an action to update the i18n state
  // The exact implementation depends on your store architecture
  // For now, this is a conceptual implementation
}

/**
 * Create SSR-safe storage mock.
 *
 * On the server, localStorage/sessionStorage don't exist.
 * This creates a no-op implementation that won't crash.
 */
function createServerStorage(): Storage {
  const storage = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      return storage.get(key) ?? null;
    },

    setItem(key: string, value: string): void {
      storage.set(key, value);
    },

    removeItem(key: string): void {
      storage.delete(key);
    },

    clear(): void {
      storage.clear();
    },

    get length(): number {
      return storage.size;
    },

    key(index: number): string | null {
      const keys = Array.from(storage.keys());
      return keys[index] ?? null;
    }
  };
}

/**
 * SvelteKit handle hook for automatic locale detection.
 *
 * This hook runs on every request and detects the user's locale,
 * making it available in all load functions via event.locals.
 *
 * @example hooks.server.ts
 * ```typescript
 * import { createI18nHandle } from '@composable-svelte/core/i18n/ssr';
 *
 * export const handle = createI18nHandle({
 *   supportedLocales: ['en', 'pt-BR', 'es'],
 *   defaultLocale: 'en'
 * });
 * ```
 *
 * @example +page.server.ts
 * ```typescript
 * export async function load({ locals }) {
 *   const locale = locals.locale; // Automatically detected
 *   // ...
 * }
 * ```
 */
export function createI18nHandle(config: {
  supportedLocales: string[];
  defaultLocale: string;
  cookieName?: string;
  urlParam?: string;
}) {
  return async ({ event, resolve }: { event: any; resolve: any }) => {
    const detector = createSSRLocaleDetector({
      supportedLocales: config.supportedLocales,
      defaultLocale: config.defaultLocale,
      url: event.url.toString(),
      cookies: event.request.headers.get('cookie') ?? '',
      acceptLanguage: event.request.headers.get('accept-language') ?? '',
      cookieName: config.cookieName,
      urlParam: config.urlParam
    });

    const locale = detector.detect();

    // Make locale available in event.locals
    event.locals.locale = locale;

    // Set Content-Language header
    const response = await resolve(event);
    response.headers.set('Content-Language', locale);

    return response;
  };
}

/**
 * Generate alternate language links for SEO.
 *
 * Search engines use these to understand that your content is available
 * in multiple languages.
 *
 * @example +page.svelte
 * ```svelte
 * <svelte:head>
 *   {@html generateAlternateLinks('/products', ['en', 'pt-BR', 'es'])}
 * </svelte:head>
 * ```
 */
export function generateAlternateLinks(
  path: string,
  locales: string[],
  baseUrl: string = ''
): string {
  return locales
    .map((locale) => {
      const url = `${baseUrl}${path}?lang=${locale}`;
      return `<link rel="alternate" hreflang="${locale}" href="${url}" />`;
    })
    .join('\n');
}

/**
 * Extract locale from URL path.
 *
 * Supports URLs like:
 * - /en/products
 * - /pt-BR/about
 *
 * @param pathname - URL pathname
 * @param supportedLocales - List of supported locales
 * @returns Locale if found, null otherwise
 */
export function extractLocaleFromPath(
  pathname: string,
  supportedLocales: string[]
): string | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const firstSegment = segments[0];
  return supportedLocales.includes(firstSegment) ? firstSegment : null;
}

/**
 * Reroute URL based on locale.
 *
 * Useful for locale-based routing (e.g., /en/products → /products with locale=en).
 *
 * @example hooks.server.ts
 * ```typescript
 * export const handle = async ({ event, resolve }) => {
 *   const locale = extractLocaleFromPath(event.url.pathname, ['en', 'pt-BR']);
 *
 *   if (locale) {
 *     event.locals.locale = locale;
 *     // Rewrite path: /en/products → /products
 *     event.url.pathname = '/' + event.url.pathname.split('/').slice(2).join('/');
 *   }
 *
 *   return resolve(event);
 * };
 * ```
 */
export function rerouteWithLocale(
  pathname: string,
  locale: string
): string {
  const segments = pathname.split('/').filter(Boolean);
  // Remove locale from path if present
  const filtered = segments.filter((s) => s !== locale);
  return '/' + filtered.join('/');
}
