/**
 * Translation function implementation with fallback chain support.
 *
 * Supports:
 * - Simple interpolation: "Hello {name}"
 * - ICU MessageFormat: "{count, plural, one {# item} other {# items}}"
 * - Function-based translations
 * - Locale-bound formatters for dates, numbers, currencies
 *
 * @module i18n/translator
 */

import type { I18nState, Translator, TranslationFunction } from './types.js';
import { isICUMessage, compileICU } from './icu.js';
import { createIntlFormatters, DateFormats, NumberFormats } from './formatters.js';

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

        // If it's a function (pre-compiled ICU message), call it with params
        if (typeof value === 'function') {
          return (value as TranslationFunction)(params ?? {});
        }

        // If it's a string with ICU MessageFormat syntax, compile and format
        if (typeof value === 'string' && isICUMessage(value)) {
          const compiled = compileICU(value, locale);
          return compiled(params ?? {});
        }

        // Otherwise use simple interpolation
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

/**
 * Formatters bound to the current locale.
 * Convenience wrapper around Intl formatters that automatically uses the current locale.
 */
export interface BoundFormatters {
  /** Format a date (e.g., "January 5, 2025" or "5 janvier 2025") */
  date: (date: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;

  /** Format a number (e.g., "1,234.56" or "1 234,56") */
  number: (value: number, options?: Intl.NumberFormatOptions) => string;

  /** Format currency (e.g., "$1,234.56" or "1 234,56 €") */
  currency: (value: number, currency: string) => string;

  /** Format relative time (e.g., "5 minutes ago" or "il y a 5 minutes") */
  relativeTime: (date: Date) => string;
}

/**
 * Create formatters bound to the current locale from i18n state.
 *
 * This is a convenience wrapper that eliminates the need to pass locale manually.
 *
 * @param i18nState - Current i18n state (for locale)
 * @returns Bound formatters that automatically use the current locale
 *
 * @example Basic Usage
 * ```typescript
 * const formatters = createFormatters($store.i18n);
 *
 * // Date formatting - respects locale conventions
 * formatters.date(post.date, DateFormats.long);
 * // en: "January 5, 2025"
 * // fr: "5 janvier 2025"
 * // es: "5 de enero de 2025"
 *
 * // Number formatting - respects locale conventions
 * formatters.number(1234.56);
 * // en: "1,234.56"
 * // fr: "1 234,56"
 * // de: "1.234,56"
 *
 * // Currency formatting
 * formatters.currency(1234.56, 'USD');
 * // en-US: "$1,234.56"
 * // fr: "1 234,56 $US"
 *
 * // Relative time
 * formatters.relativeTime(yesterday);
 * // en: "yesterday"
 * // fr: "hier"
 * ```
 *
 * @example In Svelte Component
 * ```svelte
 * <script lang="ts">
 *   import { createTranslator, createFormatters, DateFormats } from '@composable-svelte/core/i18n';
 *
 *   const t = $derived(createTranslator($store.i18n, 'common'));
 *   const formatters = $derived(createFormatters($store.i18n));
 * </script>
 *
 * <div>
 *   <h1>{post.title}</h1>
 *   <p class="date">{formatters.date(post.date, DateFormats.long)}</p>
 *   <p class="views">{formatters.number(post.views)} {t('views')}</p>
 * </div>
 * ```
 */
export function createFormatters(i18nState: I18nState): BoundFormatters {
  const locale = i18nState.currentLocale;
  const intlFormatters = createIntlFormatters();

  return {
    date: (date, options = DateFormats.long) => {
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      return intlFormatters.formatDate(d, locale, options);
    },

    number: (value, options) => {
      return intlFormatters.formatNumber(value, locale, options);
    },

    currency: (value, currency) => {
      return intlFormatters.formatCurrency(value, currency, locale);
    },

    relativeTime: (date) => {
      return intlFormatters.formatRelativeTime(date, locale);
    }
  };
}
