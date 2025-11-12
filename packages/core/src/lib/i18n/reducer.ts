/**
 * I18n reducer handles all locale/translation state changes.
 *
 * @module i18n/reducer
 */

import type { Reducer, Effect } from '../types.js';
import { Effect as EffectBuilder } from '../effect.js';
import type { I18nState, I18nAction, I18nDependencies } from './types.js';

/**
 * Build fallback chain for a locale.
 * Example: 'pt-BR' → ['pt-BR', 'pt', 'en']
 */
export function buildFallbackChain(locale: string, defaultLocale: string): string[] {
  const chain: string[] = [locale];

  // Add base language if locale has region (pt-BR → pt)
  if (locale.includes('-')) {
    const baseLanguage = locale.split('-')[0];
    if (baseLanguage) {
      chain.push(baseLanguage);
    }
  }

  // Add default locale if not already in chain
  if (!chain.includes(defaultLocale)) {
    chain.push(defaultLocale);
  }

  return chain;
}

/**
 * Determine text direction for locale.
 */
export function getDirection(locale: string): 'ltr' | 'rtl' {
  const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
  const language = locale.split('-')[0] || locale;
  return rtlLanguages.includes(language) ? 'rtl' : 'ltr';
}

/**
 * I18n reducer handles all locale/translation state changes.
 */
export const i18nReducer: Reducer<I18nState, I18nAction, I18nDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'i18n/setLocale': {
      const { locale, preloadNamespaces = [] } = action;

      // Validate locale is supported
      if (!deps.localeDetector.getSupportedLocales().includes(locale)) {
        console.warn(`Unsupported locale: ${locale}, falling back to ${state.defaultLocale}`);
        return [state, EffectBuilder.none()];
      }

      // Update state with new locale and fallback chain
      const newState: I18nState = {
        ...state,
        currentLocale: locale,
        fallbackChain: buildFallbackChain(locale, state.defaultLocale),
        direction: getDirection(locale)
      };

      // Effects: persist locale + update DOM + preload namespaces
      const effects: Effect<I18nAction>[] = [
        // Persist to localStorage/cookie
        EffectBuilder.fireAndForget(async () => {
          await deps.storage.setItem('locale', locale);
        }),

        // ✅ FIXED: Use DOM dependency instead of direct document access
        EffectBuilder.fireAndForget(async () => {
          deps.dom.setLanguage(locale);
          deps.dom.setDirection(newState.direction);
        })
      ];

      // Preload namespaces for new locale
      if (preloadNamespaces.length > 0) {
        effects.push(
          EffectBuilder.run<I18nAction>(async (dispatch) => {
            await Promise.all(
              preloadNamespaces.map(ns =>
                dispatch({ type: 'i18n/loadNamespace', namespace: ns, locale })
              )
            );
          })
        );
      }

      return [newState, EffectBuilder.batch(...effects)];
    }

    case 'i18n/loadNamespace': {
      const { namespace, locale } = action;
      const cacheKey = `${locale}:${namespace}`;

      // Skip if already loaded or loading
      // ✅ FIXED: Use array.includes() instead of Set.has()
      if (state.translations[cacheKey] || state.loadingNamespaces.includes(cacheKey)) {
        return [state, EffectBuilder.none()];
      }

      // Mark as loading
      // ✅ FIXED: Use array concatenation instead of Set.add()
      const newState: I18nState = {
        ...state,
        loadingNamespaces: [...state.loadingNamespaces, cacheKey]
      };

      // Effect: load translations
      const effect = EffectBuilder.run<I18nAction>(async (dispatch) => {
        try {
          const translations = await deps.translationLoader.load(namespace, locale);

          if (translations) {
            dispatch({
              type: 'i18n/namespaceLoaded',
              namespace,
              locale,
              translations
            });
          } else {
            throw new Error(`Namespace ${namespace} not found for locale ${locale}`);
          }
        } catch (error) {
          dispatch({
            type: 'i18n/namespaceLoadFailed',
            namespace,
            locale,
            error: error as Error
          });
        }
      });

      return [newState, effect];
    }

    case 'i18n/namespaceLoaded': {
      const { namespace, locale, translations } = action;
      const cacheKey = `${locale}:${namespace}`;

      // ✅ FIXED: Remove from array using filter
      const loadingNamespaces = state.loadingNamespaces.filter(key => key !== cacheKey);

      return [
        {
          ...state,
          translations: {
            ...state.translations,
            [cacheKey]: translations
          },
          loadingNamespaces
        },
        EffectBuilder.none()
      ];
    }

    case 'i18n/namespaceLoadFailed': {
      const { namespace, locale, error } = action;
      const cacheKey = `${locale}:${namespace}`;

      console.error(`Failed to load namespace ${namespace} for ${locale}:`, error);

      // ✅ FIXED: Remove from array using filter
      const loadingNamespaces = state.loadingNamespaces.filter(key => key !== cacheKey);

      return [{ ...state, loadingNamespaces }, EffectBuilder.none()];
    }

    case 'i18n/setDirection': {
      return [
        { ...state, direction: action.direction },
        EffectBuilder.fireAndForget(async () => {
          deps.dom.setDirection(action.direction);
        })
      ];
    }

    default:
      return [state, EffectBuilder.none()];
  }
};

/**
 * Create initial i18n state.
 */
export function createInitialI18nState(
  locale: string,
  availableLocales: string[],
  defaultLocale: string = 'en'
): I18nState {
  return {
    currentLocale: locale,
    defaultLocale,
    availableLocales,
    translations: {},
    loadingNamespaces: [],
    fallbackChain: buildFallbackChain(locale, defaultLocale),
    direction: getDirection(locale)
  };
}
