/**
 * Translation function implementation with fallback chain support.
 *
 * @module i18n/translator
 */

import type { I18nState, Translator, TranslationFunction } from './types.js';

/**
 * Simple interpolation: "Hello {name}" + { name: "Alice" } → "Hello Alice"
 */
function interpolate(template: string, params: Record<string, any>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return key in params ? String(params[key]) : match;
  });
}

/**
 * Get translation function for a namespace.
 *
 * The translator tries each locale in the fallback chain until it finds
 * a translation. If no translation is found, returns the key itself.
 *
 * @example
 * ```typescript
 * const t = createTranslator(state.i18n, 'common');
 * t('welcome', { name: 'Alice' }); // "Welcome, Alice!"
 * ```
 */
export function createTranslator(
  i18nState: I18nState,
  namespace: string
): Translator {
  return (key: string, params?: Record<string, any>) => {
    // Try each locale in fallback chain
    for (const locale of i18nState.fallbackChain) {
      const cacheKey = `${locale}:${namespace}`;
      const translations = i18nState.translations[cacheKey];

      if (translations && key in translations) {
        const value = translations[key];

        // If it's a function (ICU message), call it with params
        if (typeof value === 'function') {
          return (value as TranslationFunction)(params ?? {});
        }

        // Otherwise interpolate params into string
        return interpolate(value, params ?? {});
      }
    }

    // Fallback: return key if translation not found
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Translation missing: ${namespace}.${key}`);
    }
    return key;
  };
}

/**
 * Check if a namespace is loaded for the current locale.
 */
export function isNamespaceLoaded(
  i18nState: I18nState,
  namespace: string
): boolean {
  const cacheKey = `${i18nState.currentLocale}:${namespace}`;
  return cacheKey in i18nState.translations;
}

/**
 * Check if a namespace is currently loading.
 */
export function isNamespaceLoading(
  i18nState: I18nState,
  namespace: string
): boolean {
  const cacheKey = `${i18nState.currentLocale}:${namespace}`;
  return i18nState.loadingNamespaces.includes(cacheKey);
}

/**
 * Get all loaded namespaces for the current locale.
 */
export function getLoadedNamespaces(i18nState: I18nState): string[] {
  const prefix = `${i18nState.currentLocale}:`;
  return Object.keys(i18nState.translations)
    .filter(key => key.startsWith(prefix))
    .map(key => key.slice(prefix.length));
}
