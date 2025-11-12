/**
 * ICU MessageFormat integration.
 *
 * Provides automatic parsing and formatting of ICU MessageFormat syntax:
 * - Pluralization: {count, plural, one {# item} other {# items}}
 * - Selection: {gender, select, male {he} female {she} other {they}}
 * - Number formatting: {price, number, currency}
 * - Date formatting: {date, date, short}
 *
 * @module i18n/icu
 *
 * @example Pluralization
 * ```typescript
 * const message = "{count, plural, one {You have # item} other {You have # items}}";
 * const format = compileICU(message, 'en');
 * format({ count: 1 }); // "You have 1 item"
 * format({ count: 5 }); // "You have 5 items"
 * ```
 *
 * @example Selection (Gender)
 * ```typescript
 * const message = "{gender, select, male {He is} female {She is} other {They are}} online";
 * const format = compileICU(message, 'en');
 * format({ gender: 'male' }); // "He is online"
 * format({ gender: 'female' }); // "She is online"
 * ```
 *
 * @example Number Formatting
 * ```typescript
 * const message = "Price: {price, number, ::currency/USD}";
 * const format = compileICU(message, 'en-US');
 * format({ price: 1234.56 }); // "Price: $1,234.56"
 * ```
 */

import IntlMessageFormat from 'intl-messageformat';

/**
 * Compiled ICU message function.
 */
export type ICUMessageFunction = (params: Record<string, any>) => string;

/**
 * Cache for compiled ICU messages.
 * Key format: "locale:message"
 */
const messageCache = new Map<string, ICUMessageFunction>();

/**
 * Detect if a string contains ICU MessageFormat syntax.
 *
 * Checks for patterns like:
 * - {variable, plural, ...}
 * - {variable, select, ...}
 * - {variable, number, ...}
 * - {variable, date, ...}
 * - {variable, time, ...}
 *
 * @param str - String to check
 * @returns true if string contains ICU syntax
 *
 * @example
 * ```typescript
 * isICUMessage("Hello {name}"); // false (simple interpolation)
 * isICUMessage("{count, plural, one {# item} other {# items}}"); // true
 * isICUMessage("{gender, select, male {he} female {she}}"); // true
 * ```
 */
export function isICUMessage(str: string): boolean {
  // Check for ICU format specifiers
  return /\{\s*\w+\s*,\s*(plural|select|selectordinal|number|date|time)\s*,/.test(str);
}

/**
 * Compile an ICU MessageFormat string into a function.
 *
 * The compiled function can be called with parameters to produce
 * the formatted message.
 *
 * @param message - ICU MessageFormat string
 * @param locale - Locale for formatting rules
 * @returns Compiled message function
 *
 * @example Basic Pluralization
 * ```typescript
 * const format = compileICU(
 *   "{count, plural, one {# item} other {# items}}",
 *   'en'
 * );
 * format({ count: 1 }); // "1 item"
 * format({ count: 5 }); // "5 items"
 * ```
 *
 * @example Complex Nested
 * ```typescript
 * const format = compileICU(
 *   "{gender, select, male {{count, plural, one {He has # item} other {He has # items}}} female {{count, plural, one {She has # item} other {She has # items}}}}",
 *   'en'
 * );
 * format({ gender: 'male', count: 1 }); // "He has 1 item"
 * format({ gender: 'female', count: 5 }); // "She has 5 items"
 * ```
 */
export function compileICU(message: string, locale: string): ICUMessageFunction {
  const cacheKey = `${locale}:${message}`;

  // Check cache
  let compiled = messageCache.get(cacheKey);
  if (compiled) {
    return compiled;
  }

  // Compile message
  try {
    const formatter = new IntlMessageFormat(message, locale);

    compiled = (params: Record<string, any>) => {
      try {
        const result = formatter.format(params);
        return typeof result === 'string' ? result : String(result);
      } catch (error) {
        console.error('[i18n] ICU formatting error:', error);
        return message; // Fallback to original message
      }
    };

    // Cache compiled function
    messageCache.set(cacheKey, compiled);

    return compiled;
  } catch (error) {
    console.error('[i18n] ICU compilation error:', error);

    // Return fallback function
    return () => message;
  }
}

/**
 * Clear the ICU message cache.
 *
 * Useful when:
 * - Changing locales dynamically
 * - Hot reloading translations in development
 * - Testing
 *
 * @param locale - Optional locale to clear (clears all if not specified)
 *
 * @example
 * ```typescript
 * // Clear all cached messages
 * clearICUCache();
 *
 * // Clear only English messages
 * clearICUCache('en');
 * ```
 */
export function clearICUCache(locale?: string): void {
  if (locale) {
    // Clear messages for specific locale
    const prefix = `${locale}:`;
    for (const key of messageCache.keys()) {
      if (key.startsWith(prefix)) {
        messageCache.delete(key);
      }
    }
  } else {
    // Clear all messages
    messageCache.clear();
  }
}

/**
 * Get cache statistics.
 *
 * Useful for monitoring and debugging.
 *
 * @returns Object with cache size
 */
export function getICUCacheStats(): { size: number } {
  return {
    size: messageCache.size
  };
}

/**
 * Common ICU patterns for reference.
 *
 * These examples show the most common ICU MessageFormat patterns.
 */
export const ICUPatterns = {
  /**
   * Simple pluralization (English-style: one vs other)
   */
  simplePlural: "{count, plural, one {# item} other {# items}}",

  /**
   * Complex pluralization (Polish-style: one, few, many, other)
   */
  complexPlural: "{count, plural, one {# przedmiot} few {# przedmioty} many {# przedmiotów} other {# przedmiotów}}",

  /**
   * Arabic pluralization (6 forms!)
   */
  arabicPlural: "{count, plural, =0 {لا عناصر} one {عنصر واحد} two {عنصران} few {# عناصر} many {# عنصرًا} other {# عنصر}}",

  /**
   * Gender selection
   */
  genderSelect: "{gender, select, male {he} female {she} other {they}}",

  /**
   * Nested gender + plural
   */
  nestedGenderPlural: "{gender, select, male {{count, plural, one {He has # item} other {He has # items}}} female {{count, plural, one {She has # item} other {She has # items}}}}",

  /**
   * Number formatting as currency
   */
  currency: "Price: {price, number, ::currency/USD}",

  /**
   * Number formatting as percent
   */
  percent: "Discount: {discount, number, ::percent}",

  /**
   * Date formatting
   */
  date: "Date: {date, date, short}",

  /**
   * Time formatting
   */
  time: "Time: {time, time, short}",

  /**
   * Ordinal selection (1st, 2nd, 3rd, ...)
   */
  ordinal: "You finished {place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}"
};

/**
 * Locale-specific plural rules reference.
 *
 * Different languages have different plural categories.
 */
export const PluralRules = {
  /**
   * English, German, Dutch, Swedish, Norwegian, Danish, Italian, Spanish, Portuguese
   * Forms: one, other
   */
  english: ["one", "other"],

  /**
   * Polish, Russian, Ukrainian, Czech, Slovak
   * Forms: one, few, many, other
   */
  slavic: ["one", "few", "many", "other"],

  /**
   * Arabic
   * Forms: zero, one, two, few, many, other
   */
  arabic: ["zero", "one", "two", "few", "many", "other"],

  /**
   * Chinese, Japanese, Korean, Vietnamese, Thai
   * Forms: other (no plural distinction)
   */
  asian: ["other"],

  /**
   * French, Portuguese (Brazilian)
   * Forms: one, other (but "one" includes 0 and 1)
   */
  romance: ["one", "other"]
};
