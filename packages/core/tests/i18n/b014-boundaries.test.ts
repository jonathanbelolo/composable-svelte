import { describe, it, expect, vi, afterEach } from 'vitest';
import { expectConsole } from '../helpers/console.js';
import { isICUMessage, clearICUCache } from '../../src/lib/i18n/icu.js';
import { createTranslator } from '../../src/lib/i18n/translator.js';
import {
  i18nReducer,
  createInitialI18nState
} from '../../src/lib/i18n/reducer.js';
import { rerouteWithLocale } from '../../src/lib/i18n/ssr.js';
import { createTestStore } from '../../src/lib/test/test-store.js';
import { createNoopStorage } from '../../src/lib/dependencies/local-storage.js';
import { BundledTranslationLoader } from '../../src/lib/i18n/loader.js';
import type { I18nAction, I18nDependencies, I18nState } from '../../src/lib/i18n/types.js';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
  clearICUCache();
});

function createMockDeps(supportedLocales: string[] = ['en', 'pt-BR', 'es']): {
  deps: I18nDependencies;
  dom: { setLanguage: ReturnType<typeof vi.fn>; setDirection: ReturnType<typeof vi.fn> };
  localeDetector: { detect: ReturnType<typeof vi.fn>; getSupportedLocales: ReturnType<typeof vi.fn> };
} {
  const dom = {
    setLanguage: vi.fn(),
    setDirection: vi.fn()
  };
  const localeDetector = {
    detect: vi.fn(() => supportedLocales[0] ?? 'en'),
    getSupportedLocales: vi.fn(() => [...supportedLocales])
  };
  const deps: I18nDependencies = {
    dom,
    localeDetector,
    storage: createNoopStorage<string>(),
    translationLoader: new BundledTranslationLoader({ bundles: {} })
  };
  return { deps, dom, localeDetector };
}

describe('B014-01: ICU detection and end-to-end translator', () => {
  it('detects ordinary {value, number/date/time} without style', () => {
    expect(isICUMessage('Total: {total, number}')).toBe(true);
    expect(isICUMessage('Date: {d, date}')).toBe(true);
    expect(isICUMessage('Time: {t, time}')).toBe(true);
    expect(isICUMessage('{ value , number }')).toBe(true);
    expect(isICUMessage('{ d , date }')).toBe(true);
    expect(isICUMessage('{ t , time }')).toBe(true);
  });

  it('preserves detection of styled ICU and plural/select/selectordinal', () => {
    expect(isICUMessage('{price, number, ::currency/USD}')).toBe(true);
    expect(isICUMessage('{d, date, short}')).toBe(true);
    expect(isICUMessage('{t, time, short}')).toBe(true);
    expect(isICUMessage('{count, plural, one {# item} other {# items}}')).toBe(true);
    expect(isICUMessage('{gender, select, male {he} female {she} other {they}}')).toBe(true);
    expect(isICUMessage('{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}')).toBe(true);
  });

  it('preserves simple interpolation controls without false positives', () => {
    expect(isICUMessage('Hello {name}')).toBe(false);
    expect(isICUMessage('{simple}')).toBe(false);
    expect(isICUMessage('{count, plural}')).toBe(false);
    expect(isICUMessage('{gender, select}')).toBe(false);
  });

  it('formats ordinary unstyled number/date/time through translator end to end', () => {
    const state: I18nState = {
      currentLocale: 'en',
      defaultLocale: 'en',
      availableLocales: ['en'],
      translations: {
        'en:common': {
          greeting: 'Hello {name}',
          total: 'Total: {total, number}',
          styledPrice: 'Price: {price, number, ::currency/USD}',
          items: '{count, plural, one {# item} other {# items}}',
          eventDate: 'Date: {d, date}',
          eventTime: 'Time: {t, time}'
        }
      },
      loadingNamespaces: [],
      fallbackChain: ['en'],
      direction: 'ltr'
    };
    const t = createTranslator(state, 'common');
    const fixedUtcDate = new Date(Date.UTC(2025, 0, 15, 12, 30, 0));

    expect(t('greeting', { name: 'Alice' })).toBe('Hello Alice');
    expect(t('total', { total: 1000 })).toBe('Total: 1,000');
    expect(t('styledPrice', { price: 12.5 })).toContain('$12.50');
    expect(t('items', { count: 1 })).toBe('1 item');
    expect(t('items', { count: 3 })).toBe('3 items');
    expect(t('eventDate', { d: fixedUtcDate })).toContain('2025');
    expect(t('eventTime', { t: fixedUtcDate })).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('B014-03: Reducer purity and Effect.run console/detector side effects', () => {
  it('pure i18nReducer does not invoke console.warn or getSupportedLocales during setLocale reduction', () => {
    const { deps, localeDetector } = createMockDeps(['en', 'es']);
    const warnSpy = vi.spyOn(console, 'warn');
    const detectorSpy = vi.spyOn(localeDetector, 'getSupportedLocales');
    const initialState = createInitialI18nState('en', ['en', 'es'], 'en');

    const [newState, effect] = i18nReducer(
      initialState,
      { type: 'i18n/setLocale', locale: 'unsupported' },
      deps
    );

    expect(newState).toBe(initialState);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(detectorSpy).not.toHaveBeenCalled();
    expect(effect).toBeDefined();
    warnSpy.mockRestore();
  });

  it('pure i18nReducer does not invoke console.error during namespaceLoadFailed reduction', () => {
    const { deps } = createMockDeps(['en']);
    const errorSpy = vi.spyOn(console, 'error');
    const initialState = createInitialI18nState('en', ['en'], 'en');
    const loadingState: I18nState = {
      ...initialState,
      loadingNamespaces: ['en:common']
    };

    const [newState, effect] = i18nReducer(
      loadingState,
      {
        type: 'i18n/namespaceLoadFailed',
        namespace: 'common',
        locale: 'en',
        error: new Error('Network error')
      },
      deps
    );

    expect(newState.loadingNamespaces).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(effect).toBeDefined();
    errorSpy.mockRestore();
  });

  it('executes returned Effect.run in TestStore for unsupported locale with no pending work', async () => {
    const consoleSpy = expectConsole('warn');
    const { deps, localeDetector } = createMockDeps(['en', 'es']);
    const detectorSpy = vi.spyOn(localeDetector, 'getSupportedLocales');
    const initialState = createInitialI18nState('en', ['en'], 'en');

    const store = createTestStore<I18nState, I18nAction, I18nDependencies>({
      initialState,
      dependencies: deps,
      reducer: i18nReducer
    });
    cleanups.push(() => store.destroy());

    await store.send({ type: 'i18n/setLocale', locale: 'es' });
    await store.finish();

    expect(detectorSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy[0]?.[0]).toContain('Unsupported locale: es, ignoring.');
  });

  it('executes returned Effect.run in TestStore for namespaceLoadFailed with no pending work', async () => {
    const consoleSpy = expectConsole('error');
    const { deps } = createMockDeps(['en']);
    const initialState = createInitialI18nState('en', ['en'], 'en');
    const loadError = new Error('Fetch failed');

    const store = createTestStore<I18nState, I18nAction, I18nDependencies>({
      initialState: { ...initialState, loadingNamespaces: ['en:common'] },
      dependencies: deps,
      reducer: i18nReducer
    });
    cleanups.push(() => store.destroy());

    await store.send({
      type: 'i18n/namespaceLoadFailed',
      namespace: 'common',
      locale: 'en',
      error: loadError
    });
    await store.finish();

    expect(consoleSpy[0]?.[0]).toContain('Failed to load namespace common for en:');
    expect(consoleSpy[0]?.[1]).toBe(loadError);
  });

  it('createInitialI18nState logs immediately because factory is outside reduction', () => {
    const consoleSpy = expectConsole('warn');
    const state = createInitialI18nState('de', ['en', 'fr'], 'en');
    expect(state.currentLocale).toBe('en');
    expect(consoleSpy[0]?.[0]).toContain('Locale "de" is not in availableLocales');
  });
});

describe('B014-02: leading-locale candidate verification', () => {
  it('identifies duplicate status: leading locale segment stripping was already repaired by B007-04', () => {
    expect(rerouteWithLocale('/en/products/en/details', 'en')).toBe('/products/en/details');
    expect(rerouteWithLocale('/en/about', 'en')).toBe('/about');
    expect(rerouteWithLocale('/products/en/details', 'en')).toBe('/products/en/details');
  });
});
