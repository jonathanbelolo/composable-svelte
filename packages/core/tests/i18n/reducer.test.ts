/**
 * Tests for i18n reducer.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  i18nReducer,
  createInitialI18nState,
  buildFallbackChain,
  getDirection
} from '../../src/lib/i18n/reducer.js';
import type { I18nState, I18nAction, I18nDependencies, TranslationNamespace } from '../../src/lib/i18n/types.js';
import { Effect } from '../../src/lib/effect.js';

describe('buildFallbackChain', () => {
  it('should build chain for locale with region', () => {
    const chain = buildFallbackChain('pt-BR', 'en');
    expect(chain).toEqual(['pt-BR', 'pt', 'en']);
  });

  it('should build chain for locale without region', () => {
    const chain = buildFallbackChain('pt', 'en');
    expect(chain).toEqual(['pt', 'en']);
  });

  it('should not duplicate default locale', () => {
    const chain = buildFallbackChain('en-US', 'en');
    expect(chain).toEqual(['en-US', 'en']);
  });

  it('should handle when locale is same as default', () => {
    const chain = buildFallbackChain('en', 'en');
    expect(chain).toEqual(['en']);
  });
});

describe('getDirection', () => {
  it('should return rtl for Arabic', () => {
    expect(getDirection('ar')).toBe('rtl');
    expect(getDirection('ar-SA')).toBe('rtl');
  });

  it('should return rtl for Hebrew', () => {
    expect(getDirection('he')).toBe('rtl');
    expect(getDirection('he-IL')).toBe('rtl');
  });

  it('should return rtl for Persian', () => {
    expect(getDirection('fa')).toBe('rtl');
    expect(getDirection('fa-IR')).toBe('rtl');
  });

  it('should return ltr for English', () => {
    expect(getDirection('en')).toBe('ltr');
    expect(getDirection('en-US')).toBe('ltr');
  });

  it('should return ltr for Portuguese', () => {
    expect(getDirection('pt')).toBe('ltr');
    expect(getDirection('pt-BR')).toBe('ltr');
  });
});

describe('createInitialI18nState', () => {
  it('should create initial state', () => {
    const state = createInitialI18nState('en', ['en', 'pt-BR', 'es']);

    expect(state).toEqual({
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en', 'pt-BR', 'es'],
      translations: {},
      loadingNamespaces: [],
      fallbackChain: ['en'],
      direction: 'ltr'
    });
  });

  it('should build fallback chain', () => {
    const state = createInitialI18nState('pt-BR', ['en', 'pt-BR', 'es'], 'en');

    expect(state.fallbackChain).toEqual(['pt-BR', 'pt', 'en']);
  });

  it('should determine direction', () => {
    const state = createInitialI18nState('ar', ['en', 'ar'], 'en');

    expect(state.direction).toBe('rtl');
  });
});

describe('i18nReducer', () => {
  let mockDeps: I18nDependencies;
  let initialState: I18nState;

  beforeEach(() => {
    mockDeps = {
      translationLoader: {
        load: vi.fn(),
        preload: vi.fn()
      },
      localeDetector: {
        detect: vi.fn(() => 'en'),
        getSupportedLocales: vi.fn(() => ['en', 'pt-BR', 'es'])
      },
      storage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        keys: vi.fn(() => []),
        has: vi.fn(() => false),
        clear: vi.fn(),
        // `Storage` also declares `size()`; the mock was one member short, so
        // anything asking this stub how many items it held would have thrown.
        size: vi.fn(() => 0)
      },
      dom: {
        setLanguage: vi.fn(),
        setDirection: vi.fn()
      }
    };

    initialState = createInitialI18nState('en', ['en', 'pt-BR', 'es'], 'en');
  });

  describe('i18n/setLocale', () => {
    /**
     * `availableLocales` is the list the UI renders from — `examples/ssr-server`'s
     * LanguageSwitcher builds its buttons from `$store.i18n.availableLocales`
     * (`:14`). The reducer validated against
     * `deps.localeDetector.getSupportedLocales()` instead, a DIFFERENT list, so
     * a shipped switcher could offer a locale the reducer silently refused with
     * a `console.warn`.
     *
     * Both directions are asserted: a one-sided fix that simply dropped the
     * validation would pass the first test and fail the second.
     */
    it('accepts a locale in availableLocales that the detector does not list', () => {
      mockDeps.localeDetector.getSupportedLocales = vi.fn(() => ['en']);

      const [newState] = i18nReducer(
        initialState,
        { type: 'i18n/setLocale', locale: 'pt-BR' },
        mockDeps
      );

      expect(
        newState.currentLocale,
        'the reducer refused a locale the UI offers'
      ).toBe('pt-BR');
    });

    it('still refuses a locale that is not in availableLocales', () => {
      mockDeps.localeDetector.getSupportedLocales = vi.fn(() => ['en', 'de']);

      const [newState] = i18nReducer(
        initialState,
        { type: 'i18n/setLocale', locale: 'de' },
        mockDeps
      );

      expect(
        newState.currentLocale,
        'validation was dropped rather than redirected'
      ).toBe('en');
    });

    it('should change locale', () => {
      const action: I18nAction = {
        type: 'i18n/setLocale',
        locale: 'pt-BR'
      };

      const [newState, effect] = i18nReducer(initialState, action, mockDeps);

      expect(newState.currentLocale).toBe('pt-BR');
      expect(newState.fallbackChain).toEqual(['pt-BR', 'pt', 'en']);
      expect(newState.direction).toBe('ltr');
      expect(effect._tag).toBe('Batch');
    });

    it('should persist locale to storage', async () => {
      const action: I18nAction = {
        type: 'i18n/setLocale',
        locale: 'pt-BR'
      };

      const [, effect] = i18nReducer(initialState, action, mockDeps);

      // Execute effects
      if (effect._tag === 'Batch') {
        for (const e of effect.effects) {
          if (e._tag === 'FireAndForget') {
            await e.execute();
          }
        }
      }

      expect(mockDeps.storage.setItem).toHaveBeenCalledWith('locale', 'pt-BR');
    });

    it('should update DOM language and direction', async () => {
      // 'ar' is made valid by putting it in the app's OWN locale list. It used
      // to be added to the detector's list, which is what the reducer consulted
      // before — the detector now only *detects* a starting locale and does not
      // authorise a switch.
      const arabicState = createInitialI18nState('en', ['en', 'pt-BR', 'es', 'ar'], 'en');

      const action: I18nAction = {
        type: 'i18n/setLocale',
        locale: 'ar'
      };

      const [newState, effect] = i18nReducer(arabicState, action, mockDeps);

      // Execute effects
      if (effect._tag === 'Batch') {
        for (const e of effect.effects) {
          if (e._tag === 'FireAndForget') {
            await e.execute();
          }
        }
      }

      expect(mockDeps.dom.setLanguage).toHaveBeenCalledWith('ar');
      expect(mockDeps.dom.setDirection).toHaveBeenCalledWith('rtl');
    });

    it('should warn and return unchanged state for unsupported locale', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const action: I18nAction = {
        type: 'i18n/setLocale',
        locale: 'invalid'
      };

      const [newState, effect] = i18nReducer(initialState, action, mockDeps);

      expect(newState).toBe(initialState);
      expect(effect._tag).toBe('None');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported locale: invalid')
      );

      consoleSpy.mockRestore();
    });

    it('should preload namespaces when specified', () => {
      const action: I18nAction = {
        type: 'i18n/setLocale',
        locale: 'pt-BR',
        preloadNamespaces: ['common', 'products']
      };

      const [newState, effect] = i18nReducer(initialState, action, mockDeps);

      expect(effect._tag).toBe('Batch');
      if (effect._tag === 'Batch') {
        // Should have 2 FireAndForget effects (storage + DOM) + 1 Run effect (preload)
        expect(effect.effects.length).toBe(3);
        expect(effect.effects.some((e) => e._tag === 'Run')).toBe(true);
      }
    });
  });

  describe('i18n/loadNamespace', () => {
    it('should mark namespace as loading', () => {
      const action: I18nAction = {
        type: 'i18n/loadNamespace',
        namespace: 'common',
        locale: 'en'
      };

      const [newState, effect] = i18nReducer(initialState, action, mockDeps);

      expect(newState.loadingNamespaces).toContain('en:common');
      expect(effect._tag).toBe('Run');
    });

    it('should skip if namespace already loaded', () => {
      const state: I18nState = {
        ...initialState,
        translations: {
          'en:common': { welcome: 'Welcome' }
        }
      };

      const action: I18nAction = {
        type: 'i18n/loadNamespace',
        namespace: 'common',
        locale: 'en'
      };

      const [newState, effect] = i18nReducer(state, action, mockDeps);

      expect(newState).toBe(state);
      expect(effect._tag).toBe('None');
    });

    it('should skip if namespace already loading', () => {
      const state: I18nState = {
        ...initialState,
        loadingNamespaces: ['en:common']
      };

      const action: I18nAction = {
        type: 'i18n/loadNamespace',
        namespace: 'common',
        locale: 'en'
      };

      const [newState, effect] = i18nReducer(state, action, mockDeps);

      expect(newState).toBe(state);
      expect(effect._tag).toBe('None');
    });

    it('should dispatch success action when loading succeeds', async () => {
      const translations: TranslationNamespace = { welcome: 'Welcome' };
      mockDeps.translationLoader.load = vi.fn().mockResolvedValue(translations);

      const action: I18nAction = {
        type: 'i18n/loadNamespace',
        namespace: 'common',
        locale: 'en'
      };

      const [, effect] = i18nReducer(initialState, action, mockDeps);

      const dispatched: I18nAction[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toEqual({
        type: 'i18n/namespaceLoaded',
        namespace: 'common',
        locale: 'en',
        translations
      });
    });

    it('should dispatch failure action when loading fails', async () => {
      const error = new Error('Network error');
      mockDeps.translationLoader.load = vi.fn().mockRejectedValue(error);

      const action: I18nAction = {
        type: 'i18n/loadNamespace',
        namespace: 'common',
        locale: 'en'
      };

      const [, effect] = i18nReducer(initialState, action, mockDeps);

      const dispatched: I18nAction[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]!.type).toBe('i18n/namespaceLoadFailed');
      if (dispatched[0]!.type === 'i18n/namespaceLoadFailed') {
        expect(dispatched[0]!.error).toBe(error);
      }
    });
  });

  describe('i18n/namespaceLoaded', () => {
    it('should store translations and remove loading state', () => {
      const state: I18nState = {
        ...initialState,
        loadingNamespaces: ['en:common']
      };

      const translations: TranslationNamespace = { welcome: 'Welcome' };
      const action: I18nAction = {
        type: 'i18n/namespaceLoaded',
        namespace: 'common',
        locale: 'en',
        translations
      };

      const [newState, effect] = i18nReducer(state, action, mockDeps);

      expect(newState.translations['en:common']).toBe(translations);
      expect(newState.loadingNamespaces).not.toContain('en:common');
      expect(effect._tag).toBe('None');
    });
  });

  describe('i18n/namespaceLoadFailed', () => {
    it('should remove loading state and log error', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const state: I18nState = {
        ...initialState,
        loadingNamespaces: ['en:common']
      };

      const error = new Error('Failed to load');
      const action: I18nAction = {
        type: 'i18n/namespaceLoadFailed',
        namespace: 'common',
        locale: 'en',
        error
      };

      const [newState, effect] = i18nReducer(state, action, mockDeps);

      expect(newState.loadingNamespaces).not.toContain('en:common');
      expect(effect._tag).toBe('None');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load namespace common for en'),
        error
      );

      consoleSpy.mockRestore();
    });
  });

  describe('i18n/setDirection', () => {
    it('should change direction and update DOM', async () => {
      const action: I18nAction = {
        type: 'i18n/setDirection',
        direction: 'rtl'
      };

      const [newState, effect] = i18nReducer(initialState, action, mockDeps);

      expect(newState.direction).toBe('rtl');
      expect(effect._tag).toBe('FireAndForget');

      if (effect._tag === 'FireAndForget') {
        await effect.execute();
      }

      expect(mockDeps.dom.setDirection).toHaveBeenCalledWith('rtl');
    });
  });
});
