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
      const [locale, q] = lang.trim().split(';');
      const quality = q ? parseFloat(q.replace('q=', '')) : 1.0;
      return { locale: locale.trim(), quality };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((item) => item.locale);
}

/**
 * Normalize locale format (en-us → en-US, pt_BR → pt-BR).
 */
function normalizeLocale(locale: string): string {
  // Convert underscores to hyphens
  locale = locale.replace('_', '-');

  // Split into parts
  const parts = locale.split('-');
  if (parts.length === 1) {
    // Just language code (e.g., "en")
    return parts[0].toLowerCase();
  }

  // Language + region (e.g., "en-US")
  return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
}

/**
 * Find best matching locale from supported list.
 *
 * Supports partial matches (e.g., "pt-BR" matches "pt" if "pt-BR" not supported).
 */
function findBestMatch(preferred: string[], supported: string[]): string | null {
  // Try exact matches first
  for (const locale of preferred) {
    const normalized = normalizeLocale(locale);
    if (supported.includes(normalized)) {
      return normalized;
    }
  }

  // Try base language matches (pt-BR → pt)
  for (const locale of preferred) {
    const normalized = normalizeLocale(locale);
    const baseLanguage = normalized.split('-')[0];

    // Find any supported locale with same base language
    const match = supported.find((s) => s.split('-')[0] === baseLanguage);
    if (match) {
      return match;
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
          const normalized = normalizeLocale(urlLocale);
          if (supportedLocales.includes(normalized)) {
            return normalized;
          }
        }
      }

      // 2. Check localStorage
      if (typeof localStorage !== 'undefined') {
        try {
          const stored = localStorage.getItem(storageKey);
          if (stored && supportedLocales.includes(stored)) {
            return stored;
          }
        } catch (error) {
          // localStorage might be disabled
        }
      }

      // 3. Check cookie
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === cookieName && value) {
            const decoded = decodeURIComponent(value);
            if (supportedLocales.includes(decoded)) {
              return decoded;
            }
          }
        }
      }

      // 4. Check navigator.language
      if (typeof navigator !== 'undefined' && navigator.language) {
        const normalized = normalizeLocale(navigator.language);
        if (supportedLocales.includes(normalized)) {
          return normalized;
        }

        // Try base language
        const baseLanguage = normalized.split('-')[0];
        const match = supportedLocales.find((s) => s.split('-')[0] === baseLanguage);
        if (match) {
          return match;
        }
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
          const normalized = normalizeLocale(urlLocale);
          if (supportedLocales.includes(normalized)) {
            return normalized;
          }
        }
      } catch (error) {
        console.error('[i18n] Invalid URL:', error);
      }

      // 2. Check cookies
      if (cookies) {
        const cookieList = cookies.split(';');
        for (const cookie of cookieList) {
          const [name, value] = cookie.trim().split('=');
          if (name === cookieName && value) {
            const decoded = decodeURIComponent(value);
            if (supportedLocales.includes(decoded)) {
              return decoded;
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
