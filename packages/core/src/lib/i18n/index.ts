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
 *
 * @example ICU MessageFormat Usage
 * ```typescript
 * import { ICUPatterns } from '@composable-svelte/core/i18n';
 *
 * // In your translation JSON files, use ICU syntax:
 * // {
 * //   "items": "{count, plural, one {You have # item} other {You have # items}}",
 * //   "greeting": "{gender, select, male {Hello Mr. {name}} female {Hello Ms. {name}} other {Hello {name}}}",
 * //   "price": "Price: {value, number, ::currency/USD}"
 * // }
 *
 * // The translator automatically detects and compiles ICU messages
 * const t = createTranslator(state.i18n, 'common');
 * t('items', { count: 1 });    // "You have 1 item"
 * t('items', { count: 5 });    // "You have 5 items"
 * t('greeting', { gender: 'male', name: 'John' });  // "Hello Mr. John"
 * t('price', { value: 1234.56 }); // "Price: $1,234.56"
 *
 * // Manual ICU compilation (advanced usage)
 * import { compileICU } from '@composable-svelte/core/i18n';
 * const format = compileICU('{count, plural, one {# item} other {# items}}', 'en');
 * format({ count: 1 }); // "1 item"
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
export type { BoundFormatters } from './translator.js';
export { createTranslator, isNamespaceLoaded, isNamespaceLoading, getLoadedNamespaces, createFormatters } from './translator.js';

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

// ICU MessageFormat
export type { ICUMessageFunction } from './icu.js';
export {
  isICUMessage,
  compileICU,
  clearICUCache,
  getICUCacheStats,
  ICUPatterns,
  PluralRules
} from './icu.js';

// SSR utilities
export type { SSRConfig, I18nSSRData } from './ssr.js';
export {
  initI18nOnServer,
  hydrateI18nOnClient,
  createI18nHandle,
  generateAlternateLinks,
  extractLocaleFromPath,
  rerouteWithLocale
} from './ssr.js';
