/**
 * Internationalization (i18n) system for Composable Svelte.
 *
 * Provides a complete i18n solution integrated with the Composable Architecture:
 * - State-driven translations
 * - Locale detection (browser + SSR)
 * - Translation loading with caching
 * - Intl formatters (dates, numbers, currencies)
 * - Fallback chains
 * - TypeScript support
 *
 * @module i18n
 *
 * @example Basic Usage
 * ```typescript
 * import {
 *   createInitialI18nState,
 *   i18nReducer,
 *   createTranslator,
 *   FetchTranslationLoader,
 *   createBrowserLocaleDetector,
 *   createIntlFormatters,
 *   browserDOM
 * } from '@composable-svelte/core/i18n';
 *
 * // Initialize state
 * const locale = 'en';
 * const i18nState = createInitialI18nState(locale, ['en', 'pt-BR', 'es']);
 *
 * // Setup dependencies
 * const deps = {
 *   translationLoader: new FetchTranslationLoader({
 *     baseUrl: '/locales',
 *     supportedLocales: ['en', 'pt-BR', 'es']
 *   }),
 *   localeDetector: createBrowserLocaleDetector({
 *     supportedLocales: ['en', 'pt-BR', 'es'],
 *     defaultLocale: 'en'
 *   }),
 *   storage: localStorage,
 *   dom: browserDOM
 * };
 *
 * // Use in component
 * const t = createTranslator(state.i18n, 'common');
 * t('welcome', { name: 'Alice' }); // "Welcome, Alice!"
 *
 * // Change locale
 * store.dispatch({
 *   type: 'i18n/setLocale',
 *   locale: 'pt-BR',
 *   preloadNamespaces: ['common', 'products']
 * });
 * ```
 *
 * @example SSR Usage
 * ```typescript
 * import {
 *   createSSRLocaleDetector,
 *   BundledTranslationLoader,
 *   serverDOM
 * } from '@composable-svelte/core/i18n';
 *
 * // Import translations statically for bundler
 * import enCommon from '../locales/en/common.json';
 * import ptBRCommon from '../locales/pt-BR/common.json';
 *
 * // In SvelteKit load function
 * export async function load({ url, request }) {
 *   const detector = createSSRLocaleDetector({
 *     supportedLocales: ['en', 'pt-BR'],
 *     defaultLocale: 'en',
 *     url: url.toString(),
 *     cookies: request.headers.get('cookie') ?? '',
 *     acceptLanguage: request.headers.get('accept-language') ?? ''
 *   });
 *
 *   const locale = detector.detect();
 *
 *   const deps = {
 *     translationLoader: new BundledTranslationLoader({
 *       bundles: {
 *         'en': { common: enCommon },
 *         'pt-BR': { common: ptBRCommon }
 *       }
 *     }),
 *     localeDetector: detector,
 *     storage: new Map(), // SSR-safe storage mock
 *     dom: serverDOM
 *   };
 *
 *   return { locale, deps };
 * }
 * ```
 */

// Core types
export type {
  I18nState,
  I18nAction,
  I18nDependencies,
  TranslationNamespace,
  TranslationFunction,
  Translator,
  TranslationLoader,
  LocaleDetector,
  IntlFormatters,
  DOMInterface
} from './types.js';

// DOM implementations
export { browserDOM, serverDOM } from './types.js';

// Reducer
export { i18nReducer, createInitialI18nState, buildFallbackChain, getDirection } from './reducer.js';

// Translator
export { createTranslator, isNamespaceLoaded, isNamespaceLoading, getLoadedNamespaces } from './translator.js';

// Loaders
export { FetchTranslationLoader, BundledTranslationLoader, createGlobLoader } from './loader.js';

// Detectors
export {
  createBrowserLocaleDetector,
  createSSRLocaleDetector,
  createStaticLocaleDetector
} from './detector.js';

// Formatters
export {
  createIntlFormatters,
  clearFormatterCache,
  DateFormats,
  NumberFormats
} from './formatters.js';
