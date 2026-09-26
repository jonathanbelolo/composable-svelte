/**
 * Locale detection for browser and SSR environments.
 *
 * Detects user's preferred locale from multiple sources:
 * 1. URL parameter (?lang=pt-BR)
 * 2. Cookie (locale cookie)
 * 3. Browser Accept-Language header
 * 4. Default locale fallback
 *
 * @module i18n/detector
 */

import type { LocaleDetector } from './types.js';

/**
 * Parse Accept-Language header into sorted locale list.
 *
 * Example: "en-US,en;q=0.9,pt-BR;q=0.8,pt;q=0.7"
 * Returns: ["en-US", "en", "pt-BR", "pt"]
 *
 * @param header - Accept-Language header value
 * @returns Sorted list of locales by quality value
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((lang) => {
      const parts = lang.trim().split(';');
      const locale = parts[0];
      const qPart = parts.slice(1).find((p) => /^q=/i.test(p.trim()));
      const parsedQuality = qPart ? parseFloat(qPart.trim().replace(/^q=/i, '')) : 1.0;
      const quality = Number.isFinite(parsedQuality) ? parsedQuality : 1.0;
      return { locale: locale?.trim() || '', quality };
    })
    .filter((item) => item.locale !== '') // Remove empty locales
    .sort((a, b) => b.quality - a.quality)
    .map((item) => item.locale);
}

/**
 * Normalize locale format (en-us → en-US, pt_BR → pt-BR).
 */
function normalizeLocale(locale: string): string {
  // Convert underscores to hyphens
  const cleaned = locale.replace(/_/g, '-');

  if (typeof Intl !== 'undefined' && typeof Intl.Locale !== 'undefined') {
    try {
      return new Intl.Locale(cleaned).toString();
    } catch {
      // Fallback if tag is not a valid BCP-47 locale
    }
  }

  // Split into parts
  const parts = cleaned.split('-');
  if (parts.length === 1) {
    // Just language code (e.g., "en")
    return parts[0]?.toLowerCase() || cleaned;
  }

  // Language + region/script/variant (e.g., "en-US", "zh-Hans-CN")
  const lang = parts[0]?.toLowerCase() || '';
  const rest = parts.slice(1).map((part) => {
    if (part.length === 4) {
      // Script tag (e.g., "Hans")
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }
    if (part.length === 2) {
      // Region tag (e.g., "US", "CN")
      return part.toUpperCase();
    }
    return part;
  });
  return [lang, ...rest].join('-');
}

/**
 * Find best matching locale from supported list.
 *
 * Supports partial matches (e.g., "pt-BR" matches "pt" if "pt-BR" not supported).
 */
/** Compare canonical tags but retain the registered spelling for loader/cache keys. */
function findExactMatch(locale: string, supported: string[]): string | null {
  const normalized = normalizeLocale(locale);
  return supported.find(candidate => normalizeLocale(candidate) === normalized) ?? null;
}
function findBestMatch(preferred: string[], supported: string[]): string | null {
  for (const locale of preferred) {
    const exact = findExactMatch(locale, supported);
    if (exact !== null) return exact;
  }
  const normalizedSupported = supported.map(locale => ({ locale, normalized: normalizeLocale(locale) }));
  for (const locale of preferred) {
    let candidate = normalizeLocale(locale);
    while (candidate) {
      const exact = normalizedSupported.find(item => item.normalized === candidate);
      if (exact) return exact.locale;
      const variant = normalizedSupported.find(item => item.normalized.startsWith(candidate + '-'));
      if (variant) return variant.locale;
      const parts = candidate.split('-');
      parts.pop();
      // A truncated extension singleton is not a language range on its own.
      if (parts.at(-1)?.length === 1) parts.pop();
      candidate = parts.join('-');
    }
  }
  return null;
}

/**
 * Browser locale detector.
 *
 * Detection order:
 * 1. URL parameter (?lang=pt-BR)
 * 2. localStorage (persisted locale)
 * 3. Cookie (persisted locale)
 * 4. navigator.language
 * 5. navigator.languages
 * 6. Default locale
 *
 * @example
 * ```typescript
 * const detector = createBrowserLocaleDetector({
 *   supportedLocales: ['en', 'pt-BR', 'es'],
 *   defaultLocale: 'en',
 *   urlParam: 'lang',
 *   cookieName: 'locale'
 * });
 *
 * const locale = detector.detect(); // 'pt-BR'
 * ```
 */
export function createBrowserLocaleDetector(config: {
  supportedLocales: string[];
  defaultLocale: string;
  urlParam?: string;
  cookieName?: string;
  storageKey?: string;
}): LocaleDetector {
  const { supportedLocales, defaultLocale, urlParam = 'lang', cookieName = 'locale', storageKey = 'locale' } = config;

  return {
    detect(): string {
      // 1. Check URL parameter
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlLocale = params.get(urlParam);
        if (urlLocale) {
          const match = findExactMatch(urlLocale, supportedLocales);
          if (match !== null) return match;
        }
      }

      // 2. Check localStorage
      if (typeof localStorage !== 'undefined') {
        try {
          const stored = localStorage.getItem(storageKey);
          const match = stored ? findExactMatch(stored, supportedLocales) : null;
          if (match !== null) return match;
        } catch (error) {
          // localStorage might be disabled
        }
      }

      // 3. Check cookie
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const trimmed = cookie.trim();
          const equalsIndex = trimmed.indexOf('=');
          if (equalsIndex > 0) {
            const name = trimmed.substring(0, equalsIndex);
            const value = trimmed.substring(equalsIndex + 1);
            if (name === cookieName && value) {
              const decoded = decodeURIComponent(value);
              const match = findExactMatch(decoded, supportedLocales);
              if (match !== null) return match;
            }
          }
        }
      }

      // 4. Check navigator.language
      if (typeof navigator !== 'undefined' && navigator.language) {
        const match = findBestMatch([navigator.language], supportedLocales);
        if (match !== null) return match;
      }

      // 5. Check navigator.languages
      if (typeof navigator !== 'undefined' && navigator.languages) {
        const match = findBestMatch(Array.from(navigator.languages), supportedLocales);
        if (match) {
          return match;
        }
      }

      // 6. Fallback to default
      return defaultLocale;
    },

    getSupportedLocales(): string[] {
      return supportedLocales;
    }
  };
}

/**
 * SSR locale detector.
 *
 * Detection order:
 * 1. URL parameter (?lang=pt-BR)
 * 2. Cookie (persisted locale)
 * 3. Accept-Language header
 * 4. Default locale
 *
 * @example
 * ```typescript
 * // In SvelteKit load function
 * export async function load({ url, request }) {
 *   const detector = createSSRLocaleDetector({
 *     supportedLocales: ['en', 'pt-BR', 'es'],
 *     defaultLocale: 'en',
 *     url: url.toString(),
 *     cookies: request.headers.get('cookie') ?? '',
 *     acceptLanguage: request.headers.get('accept-language') ?? ''
 *   });
 *
 *   const locale = detector.detect();
 *   return { locale };
 * }
 * ```
 */
export function createSSRLocaleDetector(config: {
  supportedLocales: string[];
  defaultLocale: string;
  url: string;
  cookies: string;
  acceptLanguage: string;
  urlParam?: string;
  cookieName?: string;
}): LocaleDetector {
  const { supportedLocales, defaultLocale, url, cookies, acceptLanguage, urlParam = 'lang', cookieName = 'locale' } = config;

  return {
    detect(): string {
      // 1. Check URL parameter
      try {
        const urlObj = new URL(url);
        const urlLocale = urlObj.searchParams.get(urlParam);
        if (urlLocale) {
          const match = findExactMatch(urlLocale, supportedLocales);
          if (match !== null) return match;
        }
      } catch (error) {
        console.error('[i18n] Invalid URL:', error);
      }

      // 2. Check cookies
      if (cookies) {
        const cookieList = cookies.split(';');
        for (const cookie of cookieList) {
          const trimmed = cookie.trim();
          const equalsIndex = trimmed.indexOf('=');
          if (equalsIndex > 0) {
            const name = trimmed.substring(0, equalsIndex);
            const value = trimmed.substring(equalsIndex + 1);
            if (name === cookieName && value) {
              const decoded = decodeURIComponent(value);
              const match = findExactMatch(decoded, supportedLocales);
              if (match !== null) return match;
            }
          }
        }
      }

      // 3. Check Accept-Language header
      if (acceptLanguage) {
        const preferred = parseAcceptLanguage(acceptLanguage);
        const match = findBestMatch(preferred, supportedLocales);
        if (match) {
          return match;
        }
      }

      // 4. Fallback to default
      return defaultLocale;
    },

    getSupportedLocales(): string[] {
      return supportedLocales;
    }
  };
}

/**
 * Static locale detector (always returns same locale).
 *
 * Useful for testing or when locale is hardcoded.
 *
 * @example
 * ```typescript
 * const detector = createStaticLocaleDetector('pt-BR', ['en', 'pt-BR', 'es']);
 * detector.detect(); // Always returns 'pt-BR'
 * ```
 */
export function createStaticLocaleDetector(locale: string, supportedLocales: string[]): LocaleDetector {
  return {
    detect(): string {
      return locale;
    },

    getSupportedLocales(): string[] {
      return supportedLocales;
    }
  };
}
