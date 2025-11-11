/**
 * Tests for i18n translator.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTranslator,
  isNamespaceLoaded,
  isNamespaceLoading,
  getLoadedNamespaces
} from '../../src/lib/i18n/translator.js';
import type { I18nState, TranslationNamespace } from '../../src/lib/i18n/types.js';

describe('createTranslator', () => {
  let state: I18nState;

  beforeEach(() => {
    state = {
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en', 'pt-BR', 'es'],
      translations: {
        'en:common': {
          welcome: 'Welcome',
          greeting: 'Hello, {name}!',
          items: 'You have {count} items'
        },
        'pt-BR:common': {
          welcome: 'Bem-vindo',
          greeting: 'Olá, {name}!'
          // Missing 'items' to test fallback
        }
      },
      loadingNamespaces: [],
      fallbackChain: ['en'],
      direction: 'ltr'
    };
  });

  describe('basic translation', () => {
    it('should translate a simple key', () => {
      const t = createTranslator(state, 'common');
      expect(t('welcome')).toBe('Welcome');
    });

    it('should interpolate parameters', () => {
      const t = createTranslator(state, 'common');
      expect(t('greeting', { name: 'Alice' })).toBe('Hello, Alice!');
    });

    it('should interpolate multiple parameters', () => {
      const t = createTranslator(state, 'common');
      expect(t('items', { count: 5 })).toBe('You have 5 items');
    });

    it('should preserve placeholders when params not provided', () => {
      const t = createTranslator(state, 'common');
      expect(t('greeting')).toBe('Hello, {name}!');
    });

    it('should preserve unknown placeholders', () => {
      const t = createTranslator(state, 'common');
      expect(t('greeting', { wrongParam: 'value' })).toBe('Hello, {name}!');
    });

    it('should handle empty params object', () => {
      const t = createTranslator(state, 'common');
      expect(t('greeting', {})).toBe('Hello, {name}!');
    });
  });

  describe('fallback chain', () => {
    it('should fall back through locale chain', () => {
      // Set fallback chain: pt-BR → pt → en
      state.fallbackChain = ['pt-BR', 'pt', 'en'];

      const t = createTranslator(state, 'common');

      // 'welcome' exists in pt-BR
      expect(t('welcome')).toBe('Bem-vindo');

      // 'items' doesn't exist in pt-BR, should fall back to 'en'
      expect(t('items', { count: 3 })).toBe('You have 3 items');
    });

    it('should return key if not found in any locale', () => {
      const t = createTranslator(state, 'common');
      expect(t('nonexistent')).toBe('nonexistent');
    });

    it('should warn in dev mode when translation missing', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Set DEV mode
      const originalEnv = import.meta.env.DEV;
      (import.meta.env as any).DEV = true;

      const t = createTranslator(state, 'common');
      t('missing');

      expect(consoleSpy).toHaveBeenCalledWith(
        '[i18n] Translation missing: common.missing'
      );

      // Restore
      (import.meta.env as any).DEV = originalEnv;
      consoleSpy.mockRestore();
    });
  });

  describe('function-based translations', () => {
    beforeEach(() => {
      state.translations['en:common'] = {
        ...state.translations['en:common'],
        itemCount: (params: Record<string, any>) => {
          const count = params.count as number;
          return count === 1 ? '1 item' : `${count} items`;
        }
      };
    });

    it('should call function with params', () => {
      const t = createTranslator(state, 'common');

      expect(t('itemCount', { count: 1 })).toBe('1 item');
      expect(t('itemCount', { count: 5 })).toBe('5 items');
    });

    it('should call function with empty params if not provided', () => {
      const t = createTranslator(state, 'common');

      // Should call with empty object, resulting in undefined count
      const result = t('itemCount');
      expect(result).toContain('undefined'); // undefined becomes string "undefined"
    });
  });

  describe('namespace handling', () => {
    it('should work with different namespaces', () => {
      state.translations['en:products'] = {
        title: 'Products'
      };

      const tCommon = createTranslator(state, 'common');
      const tProducts = createTranslator(state, 'products');

      expect(tCommon('welcome')).toBe('Welcome');
      expect(tProducts('title')).toBe('Products');
    });

    it('should return key when namespace not loaded', () => {
      const t = createTranslator(state, 'nonexistent');
      expect(t('someKey')).toBe('someKey');
    });
  });
});

describe('isNamespaceLoaded', () => {
  let state: I18nState;

  beforeEach(() => {
    state = {
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en'],
      translations: {
        'en:common': { welcome: 'Welcome' }
      },
      loadingNamespaces: [],
      fallbackChain: ['en'],
      direction: 'ltr'
    };
  });

  it('should return true for loaded namespace', () => {
    expect(isNamespaceLoaded(state, 'common')).toBe(true);
  });

  it('should return false for unloaded namespace', () => {
    expect(isNamespaceLoaded(state, 'products')).toBe(false);
  });

  it('should check current locale', () => {
    state.currentLocale = 'pt-BR';
    expect(isNamespaceLoaded(state, 'common')).toBe(false);

    state.translations['pt-BR:common'] = { welcome: 'Bem-vindo' };
    expect(isNamespaceLoaded(state, 'common')).toBe(true);
  });
});

describe('isNamespaceLoading', () => {
  let state: I18nState;

  beforeEach(() => {
    state = {
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en'],
      translations: {},
      loadingNamespaces: ['en:common'],
      fallbackChain: ['en'],
      direction: 'ltr'
    };
  });

  it('should return true for loading namespace', () => {
    expect(isNamespaceLoading(state, 'common')).toBe(true);
  });

  it('should return false for non-loading namespace', () => {
    expect(isNamespaceLoading(state, 'products')).toBe(false);
  });

  it('should check current locale', () => {
    state.currentLocale = 'pt-BR';
    expect(isNamespaceLoading(state, 'common')).toBe(false);

    state.loadingNamespaces = [...state.loadingNamespaces, 'pt-BR:common'];
    expect(isNamespaceLoading(state, 'common')).toBe(true);
  });
});

describe('getLoadedNamespaces', () => {
  let state: I18nState;

  beforeEach(() => {
    state = {
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en', 'pt-BR'],
      translations: {
        'en:common': { welcome: 'Welcome' },
        'en:products': { title: 'Products' },
        'pt-BR:common': { welcome: 'Bem-vindo' }
      },
      loadingNamespaces: [],
      fallbackChain: ['en'],
      direction: 'ltr'
    };
  });

  it('should return all loaded namespaces for current locale', () => {
    const namespaces = getLoadedNamespaces(state);
    expect(namespaces).toEqual(['common', 'products']);
  });

  it('should filter by current locale', () => {
    state.currentLocale = 'pt-BR';
    const namespaces = getLoadedNamespaces(state);
    expect(namespaces).toEqual(['common']);
  });

  it('should return empty array when no namespaces loaded', () => {
    state.translations = {};
    const namespaces = getLoadedNamespaces(state);
    expect(namespaces).toEqual([]);
  });
});
