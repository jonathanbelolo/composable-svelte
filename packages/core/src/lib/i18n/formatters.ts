/**
 * Intl API formatters for dates, numbers, currencies, and relative time.
 *
 * These are thin wrappers around the native Intl API with caching for performance.
 *
 * @module i18n/formatters
 */

import type { IntlFormatters } from './types.js';

/**
 * Cache for Intl formatter instances.
 * Intl formatters are expensive to create, so we cache them by locale + options.
 */
class FormatterCache<T> {
  private cache = new Map<string, T>();

  get(key: string): T | undefined {
    return this.cache.get(key);
  }

  set(key: string, formatter: T): void {
    this.cache.set(key, formatter);
  }

  clear(): void {
    this.cache.clear();
  }
}

const dateFormatters = new FormatterCache<Intl.DateTimeFormat>();
const numberFormatters = new FormatterCache<Intl.NumberFormat>();

/**
 * Create cache key from locale and options.
 */
function createCacheKey(locale: string, options?: any): string {
  return options ? `${locale}:${JSON.stringify(options)}` : locale;
}

/**
 * Get or create a cached DateTimeFormat instance.
 */
function getDateFormatter(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = createCacheKey(locale, options);
  let formatter = dateFormatters.get(key);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, formatter);
  }

  return formatter;
}

/**
 * Get or create a cached NumberFormat instance.
 */
function getNumberFormatter(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = createCacheKey(locale, options);
  let formatter = numberFormatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(key, formatter);
  }

  return formatter;
}

/**
 * Default Intl formatters implementation.
 *
 * Uses native browser Intl API with caching for performance.
 *
 * @example
 * ```typescript
 * const formatters = createIntlFormatters();
 *
 * formatters.formatDate(new Date(), 'pt-BR', { dateStyle: 'long' });
 * // → "1 de janeiro de 2024"
 *
 * formatters.formatCurrency(1234.56, 'USD', 'en-US');
 * // → "$1,234.56"
 *
 * formatters.formatRelativeTime(yesterday, 'en-US');
 * // → "yesterday"
 * ```
 */
export function createIntlFormatters(): IntlFormatters {
  return {
    /**
     * Format date according to locale.
     *
     * @example
     * ```typescript
     * formatDate(new Date(), 'pt-BR', { dateStyle: 'long' });
     * // → "1 de janeiro de 2024"
     *
     * formatDate(new Date(), 'en-US', { weekday: 'long', month: 'short', day: 'numeric' });
     * // → "Monday, Jan 1"
     * ```
     */
    formatDate(date: Date, locale: string, options?: Intl.DateTimeFormatOptions): string {
      try {
        const formatter = getDateFormatter(locale, options);
        return formatter.format(date);
      } catch (error) {
        console.error('[i18n] Date formatting error:', error);
        return date.toISOString();
      }
    },

    /**
     * Format number according to locale.
     *
     * @example
     * ```typescript
     * formatNumber(1234.56, 'pt-BR');
     * // → "1.234,56"
     *
     * formatNumber(1234.56, 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
     * // → "1,234.56"
     * ```
     */
    formatNumber(num: number, locale: string, options?: Intl.NumberFormatOptions): string {
      try {
        const formatter = getNumberFormatter(locale, options);
        return formatter.format(num);
      } catch (error) {
        console.error('[i18n] Number formatting error:', error);
        return String(num);
      }
    },

    /**
     * Format currency according to locale.
     *
     * @example
     * ```typescript
     * formatCurrency(1234.56, 'USD', 'en-US');
     * // → "$1,234.56"
     *
     * formatCurrency(1234.56, 'BRL', 'pt-BR');
     * // → "R$ 1.234,56"
     *
     * formatCurrency(1234.56, 'EUR', 'de-DE');
     * // → "1.234,56 €"
     * ```
     */
    formatCurrency(amount: number, currency: string, locale: string): string {
      try {
        const formatter = getNumberFormatter(locale, {
          style: 'currency',
          currency
        });
        return formatter.format(amount);
      } catch (error) {
        console.error('[i18n] Currency formatting error:', error);
        return `${currency} ${amount}`;
      }
    },

    /**
     * Format relative time (e.g., "2 hours ago", "in 3 days").
     *
     * Uses heuristics to determine the best unit (seconds, minutes, hours, days, etc.).
     *
     * @example
     * ```typescript
     * const now = new Date();
     * const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
     *
     * formatRelativeTime(yesterday, 'en-US');
     * // → "yesterday"
     *
     * const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
     * formatRelativeTime(twoHoursAgo, 'pt-BR');
     * // → "há 2 horas"
     * ```
     */
    formatRelativeTime(date: Date, locale: string): string {
      try {
        const now = Date.now();
        const diff = date.getTime() - now;
        const absDiff = Math.abs(diff);

        // Determine best unit
        let value: number;
        let unit: Intl.RelativeTimeFormatUnit;

        if (absDiff < 60 * 1000) {
          // Less than 1 minute
          value = Math.round(diff / 1000);
          unit = 'second';
        } else if (absDiff < 60 * 60 * 1000) {
          // Less than 1 hour
          value = Math.round(diff / (60 * 1000));
          unit = 'minute';
        } else if (absDiff < 24 * 60 * 60 * 1000) {
          // Less than 1 day
          value = Math.round(diff / (60 * 60 * 1000));
          unit = 'hour';
        } else if (absDiff < 7 * 24 * 60 * 60 * 1000) {
          // Less than 1 week
          value = Math.round(diff / (24 * 60 * 60 * 1000));
          unit = 'day';
        } else if (absDiff < 30 * 24 * 60 * 60 * 1000) {
          // Less than 1 month
          value = Math.round(diff / (7 * 24 * 60 * 60 * 1000));
          unit = 'week';
        } else if (absDiff < 365 * 24 * 60 * 60 * 1000) {
          // Less than 1 year
          value = Math.round(diff / (30 * 24 * 60 * 60 * 1000));
          unit = 'month';
        } else {
          // 1 year or more
          value = Math.round(diff / (365 * 24 * 60 * 60 * 1000));
          unit = 'year';
        }

        const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        return formatter.format(value, unit);
      } catch (error) {
        console.error('[i18n] Relative time formatting error:', error);
        return date.toISOString();
      }
    }
  };
}

/**
 * Clear all cached formatters.
 * Useful when locale changes or in testing.
 */
export function clearFormatterCache(): void {
  dateFormatters.clear();
  numberFormatters.clear();
}

/**
 * Common date format presets.
 */
export const DateFormats = {
  short: { dateStyle: 'short' } as Intl.DateTimeFormatOptions,
  medium: { dateStyle: 'medium' } as Intl.DateTimeFormatOptions,
  long: { dateStyle: 'long' } as Intl.DateTimeFormatOptions,
  full: { dateStyle: 'full' } as Intl.DateTimeFormatOptions,

  shortTime: { timeStyle: 'short' } as Intl.DateTimeFormatOptions,
  mediumTime: { timeStyle: 'medium' } as Intl.DateTimeFormatOptions,
  longTime: { timeStyle: 'long' } as Intl.DateTimeFormatOptions,

  shortDateTime: { dateStyle: 'short', timeStyle: 'short' } as Intl.DateTimeFormatOptions,
  mediumDateTime: { dateStyle: 'medium', timeStyle: 'short' } as Intl.DateTimeFormatOptions,
  longDateTime: { dateStyle: 'long', timeStyle: 'short' } as Intl.DateTimeFormatOptions
};

/**
 * Common number format presets.
 */
export const NumberFormats = {
  integer: { maximumFractionDigits: 0 } as Intl.NumberFormatOptions,
  decimal: { minimumFractionDigits: 2, maximumFractionDigits: 2 } as Intl.NumberFormatOptions,
  percent: { style: 'percent', minimumFractionDigits: 0 } as Intl.NumberFormatOptions,
  percentDecimal: { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 } as Intl.NumberFormatOptions
};
