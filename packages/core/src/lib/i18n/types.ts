/**
 * Core types for internationalization (i18n) system.
 *
 * This module defines the state, actions, and dependencies for the i18n system,
 * fully integrated with the Composable Architecture.
 *
 * @module i18n/types
 */

/**
 * Translation namespace containing key-value pairs or functions.
 *
 * Simple translations are strings with optional interpolation:
 * ```json
 * {
 *   "welcome": "Welcome, {name}!",
 *   "logout": "Logout"
 * }
 * ```
 *
 * Complex translations can be functions (for ICU MessageFormat):
 * ```typescript
 * {
 *   "items": (params: { count: number }) => `${params.count} item${params.count === 1 ? '' : 's'}`
 * }
 * ```
 */
export type TranslationNamespace = Record<string, string | TranslationFunction>;

/**
 * Function-based translation for complex ICU messages.
 */
export type TranslationFunction = (params: Record<string, any>) => string;

/**
 * I18n state managed in the store.
 *
 * IMPORTANT: All fields must be JSON-serializable for SSR.
 */
export interface I18nState {
  /** Current active locale (e.g., 'en-US', 'pt-BR') */
  currentLocale: string;

  /** Default fallback locale */
  defaultLocale: string;

  /** All available locales in the app */
  availableLocales: readonly string[];

  /** Loaded translation namespaces (keyed by "locale:namespace") */
  translations: Record<string, TranslationNamespace>;

  /**
   * Namespaces currently being loaded.
   * ✅ FIXED: Changed from Set<string> to readonly string[] for JSON serialization.
   */
  loadingNamespaces: readonly string[];

  /** Fallback chain for current locale (e.g., ['pt-BR', 'pt', 'en']) */
  fallbackChain: readonly string[];

  /** Text direction for current locale */
  direction: 'ltr' | 'rtl';
}

/**
 * All i18n actions are part of the app's action union.
 */
export type I18nAction =
  | {
      type: 'i18n/setLocale';
      locale: string;
      /** Optional: preload namespaces for new locale */
      preloadNamespaces?: string[];
    }
  | {
      type: 'i18n/loadNamespace';
      namespace: string;
      locale: string;
    }
  | {
      type: 'i18n/namespaceLoaded';
      namespace: string;
      locale: string;
      translations: TranslationNamespace;
    }
  | {
      type: 'i18n/namespaceLoadFailed';
      namespace: string;
      locale: string;
      error: Error;
    }
  | {
      type: 'i18n/setDirection';
      direction: 'ltr' | 'rtl';
    };

/**
 * Injectable dependencies for i18n.
 */
export interface I18nDependencies {
  /** Load translations from server/bundle */
  translationLoader: TranslationLoader;

  /** Detect user's preferred locale */
  localeDetector: LocaleDetector;

  /** Persist locale preference */
  storage: Storage;

  /**
   * DOM manipulation interface.
   * ✅ FIXED: Abstracts document access for SSR safety.
   */
  dom: DOMInterface;
}

/**
 * DOM manipulation interface (browser vs server).
 */
export interface DOMInterface {
  /** Set document language attribute */
  setLanguage(locale: string): void;

  /** Set text direction attribute */
  setDirection(dir: 'ltr' | 'rtl'): void;
}

/**
 * Browser implementation of DOM interface.
 */
export const browserDOM: DOMInterface = {
  setLanguage(locale: string): void {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  },
  setDirection(dir: 'ltr' | 'rtl'): void {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = dir;
    }
  }
};

/**
 * Server implementation (no-op).
 */
export const serverDOM: DOMInterface = {
  setLanguage(): void {
    // No-op on server
  },
  setDirection(): void {
    // No-op on server
  }
};

/**
 * Translation loader interface.
 */
export interface TranslationLoader {
  /**
   * Load a translation namespace for a locale.
   * Returns null if namespace doesn't exist.
   */
  load(namespace: string, locale: string): Promise<TranslationNamespace | null>;

  /**
   * Preload multiple namespaces in parallel.
   */
  preload(namespaces: string[], locale: string): Promise<void>;
}

/**
 * Locale detector interface.
 */
export interface LocaleDetector {
  /**
   * Detect user's preferred locale from:
   * - URL parameter (?lang=pt-BR)
   * - Cookie
   * - Browser Accept-Language header
   * - Default locale
   */
  detect(): string;

  /**
   * Get list of supported locales for fallback chain.
   */
  getSupportedLocales(): string[];
}

/**
 * Intl formatters for dates, numbers, currencies.
 */
export interface IntlFormatters {
  /**
   * Format date according to locale.
   */
  formatDate(date: Date, locale: string, options?: Intl.DateTimeFormatOptions): string;

  /**
   * Format number according to locale.
   */
  formatNumber(num: number, locale: string, options?: Intl.NumberFormatOptions): string;

  /**
   * Format currency according to locale.
   */
  formatCurrency(amount: number, currency: string, locale: string): string;

  /**
   * Format relative time (e.g., "2 hours ago").
   */
  formatRelativeTime(date: Date, locale: string): string;
}

/**
 * Translation function signature.
 */
export type Translator = (key: string, params?: Record<string, any>) => string;
