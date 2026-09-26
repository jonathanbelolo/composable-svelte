import { describe, it, expect, vi, afterEach } from 'vitest';
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0))
    cleanup(); });
import { expectConsole } from '../helpers/console.js';
import { createSSRLocaleDetector, createStaticLocaleDetector } from '../../src/lib/i18n/detector.js';
import { createIntlFormatters } from '../../src/lib/i18n/formatters.js';
import { createTranslator } from '../../src/lib/i18n/translator.js';
import { createInitialI18nState, i18nReducer } from '../../src/lib/i18n/reducer.js';
import { hydrateI18nOnClient, rerouteWithLocale } from '../../src/lib/i18n/ssr.js';
import { createTestStore } from '../../src/lib/test/test-store.js';
import { createNoopStorage } from '../../src/lib/dependencies/local-storage.js';
import { BundledTranslationLoader } from '../../src/lib/i18n/loader.js';
import type { I18nAction, I18nDependencies, I18nState } from '../../src/lib/i18n/types.js';
const detector = (acceptLanguage: string, supportedLocales = ['fr', 'en']) => createSSRLocaleDetector({ acceptLanguage, supportedLocales, defaultLocale: 'en', url: 'https://example.test/', cookies: '' });
describe('i18n candidate regressions', () => {
    it('B007-09 reads quality after other parameters', () => expect(detector('fr;level=1;q=0.5,en;q=0.8').detect()).toBe('en'));
    it('B007-10 preserves script and region', () => expect(detector('zh_Hans_CN', ['en', 'zh-Hans-SG', 'zh-Hans-CN']).detect()).toBe('zh-Hans-CN'));
    it('B007-03 invalid dates have safe formatter fallbacks', () => { expectConsole('error', 2); const f = createIntlFormatters(); expect(f.formatDate(new Date(NaN), 'en')).toBe('Invalid Date'); expect(f.formatRelativeTime(new Date(NaN), 'en')).toBe('Invalid Date'); });
    it('B007-04 only removes leading locale', () => expect(rerouteWithLocale('/en/products/en/details', 'en')).toBe('/products/en/details'));
    it('B007-05 ignores inherited dictionary and parameter values', () => { expectConsole('warn', 1); const state = createInitialI18nState('en', ['en'], 'en'); state.translations = { 'en:common': Object.assign(Object.create({ inherited: 'secret' }), { hello: 'Hello {name}' }) }; const t = createTranslator(state, 'common'); expect(t('inherited')).toBe('inherited'); expect(t('hello', Object.create({ name: 'secret' }))).toBe('Hello {name}'); });
    it('B007-01 hydrate dispatch restores server state through reducer without mutating unrelated root state', async () => {
        const server = createInitialI18nState('ar', ['en', 'ar'], 'en');
        server.translations = { 'ar:common': { hello: 'مرحبا' } };
        const initial = createInitialI18nState('en', ['en', 'ar'], 'en');
        initial.translations = { 'en:cached': { hello: 'cached' } };
        const dom = { setLanguage: vi.fn(), setDirection: vi.fn() };
        const deps: I18nDependencies = { dom, storage: createNoopStorage<string>(), localeDetector: createStaticLocaleDetector('en', ['en', 'ar']), translationLoader: new BundledTranslationLoader({ bundles: {} }) };
        const store = createTestStore<{
            i18n: I18nState;
            other: number;
        }, I18nAction, I18nDependencies>({ initialState: { i18n: initial, other: 42 }, dependencies: deps, reducer: (state, action, d) => { const [i18n, effect] = i18nReducer(state.i18n, action, d); return [{ ...state, i18n }, effect]; } });
        cleanups.push(() => store.destroy());
        let sent: Promise<void> | undefined;
        const dispatch = vi.fn((action: I18nAction) => { sent = store.send(action); });
        hydrateI18nOnClient({ state: store.state, dispatch }, { locale: 'ar', state: server, translations: server.translations });
        expect(dispatch).toHaveBeenCalledTimes(1);
        await sent;
        expect(store.state.i18n.currentLocale).toBe('ar');
        expect(store.state.other).toBe(42);
        expect(store.state.i18n.translations['en:cached']).toEqual({ hello: 'cached' });
        await store.finish();
        expect(dom.setLanguage).toHaveBeenCalledWith('ar');
        expect(dom.setDirection).toHaveBeenCalledWith('rtl');
        store.destroy();
    });
    it('locale canonicalization preserves Unicode extension distinctions', () => expect(detector('en-US-u-ca-buddhist', ['en-US-u-ca-gregory', 'en-US-u-ca-buddhist']).detect()).toBe('en-US-u-ca-buddhist'));
    it('hydration supports explicit parent action embedding without direct writes', () => {
        const initial = createInitialI18nState('en', ['en', 'ar'], 'en');
        const server = createInitialI18nState('ar', ['en', 'ar'], 'en');
        type RootAction = {
            type: 'locale';
            action: I18nAction;
        };
        const dispatch = vi.fn<(action: RootAction) => void>();
        const state = { i18n: initial, other: 42 };
        hydrateI18nOnClient({ state, dispatch }, { locale: 'ar', state: server, translations: {} }, action => ({ type: 'locale', action }));
        expect(state.i18n).toBe(initial);
        expect(dispatch.mock.calls[0]?.[0].type).toBe('locale');
        expect(dispatch.mock.calls[0]?.[0].action.type).toBe('i18n/hydrate');
    });
});
