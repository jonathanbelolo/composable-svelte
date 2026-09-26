import { it, expect, vi } from 'vitest';
import { createSSRLocaleDetector, createStaticLocaleDetector } from '../../src/lib/i18n/detector.js';
import { expectConsole } from '../helpers/console.js';
import { initI18nOnServer, hydrateI18nOnClient } from '../../src/lib/i18n/ssr.js';
import { createInitialI18nState, i18nReducer } from '../../src/lib/i18n/reducer.js';
import { createTranslator } from '../../src/lib/i18n/translator.js';
import { createNoopStorage } from '../../src/lib/dependencies/local-storage.js';
import { BundledTranslationLoader } from '../../src/lib/i18n/loader.js';
import type { I18nAction, I18nDependencies, I18nState } from '../../src/lib/i18n/types.js';
const detect = (acceptLanguage: string, supportedLocales: string[], extra = {}) => createSSRLocaleDetector({ acceptLanguage, supportedLocales, defaultLocale: 'en', url: 'https://example.test/', cookies: '', ...extra }).detect();
it('F2 falls back through script and region before unrelated script', () => {
    expect(detect('zh-Hans-CN', ['zh-Hant', 'zh-Hans'])).toBe('zh-Hans');
    expect(detect('en-US-u-ca-buddhist', ['en-GB', 'en-US'])).toBe('en-US');
    expect(detect('en-GB', ['en'])).toBe('en');
});
it('F3 normalizes comparison while returning registered loader/cache spelling', () => {
    expect(detect('he', ['iw'])).toBe('iw');
    expect(detect('en-US-u-ca-gregory-nu-latn', ['en-US-u-nu-latn-ca-gregory'])).toBe('en-US-u-nu-latn-ca-gregory');
    expect(detect('en', ['iw'], { cookies: 'locale=he' })).toBe('iw');
    expect(detect('en', ['iw'], { url: 'https://example.test/?lang=he' })).toBe('iw');
});
it('F10 quality names are case-insensitive', () => expect(detect('fr;Q=0.5,en;q=0.8', ['fr', 'en'])).toBe('en'));
it('F1/F7/F8 round-trips actual producer and preserves client loading/cache ownership through wrapped dispatch', async () => {
    const ssr = JSON.parse(JSON.stringify(await initI18nOnServer({ request: new Request('https://example.test/', { headers: { 'accept-language': 'ar' } }), url: 'https://example.test/', supportedLocales: ['en', 'ar'], defaultLocale: 'en', bundles: { ar: { common: { hello: 'server' } } }, preloadNamespaces: ['common'] })));
    expect(Object.keys(ssr.translations)).toEqual(['ar:common']);
    const compiled = () => 'client compiled';
    let root: {
        i18n: I18nState;
        other: number;
    } = { i18n: { ...createInitialI18nState('en', ['en', 'ar'], 'en'), translations: { 'ar:common': { hello: compiled } }, loadingNamespaces: ['en:pending'] }, other: 42 };
    const loader = new BundledTranslationLoader({ bundles: {} });
    const load = vi.spyOn(loader, 'load');
    const storage = createNoopStorage<string>();
    const write = vi.spyOn(storage, 'setItem');
    const dom = { setLanguage: vi.fn(), setDirection: vi.fn() };
    const deps: I18nDependencies = { translationLoader: loader, localeDetector: createStaticLocaleDetector('en', ['en', 'ar']), storage, dom };
    type RootAction = {
        type: 'locale';
        action: I18nAction;
    };
    const effects: Array<() => void | Promise<void>> = [];
    const store = { get state() { return root; }, dispatch(action: RootAction) { const [i18n, effect] = i18nReducer(root.i18n, action.action, deps); root = { ...root, i18n }; if (effect._tag === 'FireAndForget')
            effects.push(effect.execute); } };
    hydrateI18nOnClient(store, ssr, action => ({ type: 'locale', action }));
    for (const effect of effects)
        await effect();
    expect(root.i18n.currentLocale).toBe('ar');
    expect(root.i18n.loadingNamespaces).toEqual(['en:pending']);
    expect(root.other).toBe(42);
    expect(createTranslator(root.i18n, 'common')('hello')).toBe('client compiled');
    expect(write).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(dom.setLanguage).toHaveBeenCalledWith('ar');
});
// Type-only consumer contracts; these branches never run.
if (false) {
    const state = { i18n: createInitialI18nState('en', ['en'], 'en') };
    const data = { locale: 'en', state: state.i18n, translations: {} };
    const wrong = { state, dispatch(_action: {
            type: 'other';
        }) { } };
    // @ts-expect-error A root union without hydration must map the child action.
    hydrateI18nOnClient(wrong, data);
    const direct = { state, dispatch(_action: I18nAction | {
            type: 'other';
        }) { } };
    hydrateI18nOnClient(direct, data);
    hydrateI18nOnClient(wrong, data, () => ({ type: 'other' }));
}
it('plain object prototype names do not leak through translation or interpolation', () => {
    expectConsole('warn', 2);
    const state = { ...createInitialI18nState('en', ['en'], 'en'), translations: { 'en:common': { hello: 'Hello {constructor}' } } };
    const translate = createTranslator(state, 'common');
    expect(translate('constructor')).toBe('constructor');
    expect(translate('toString')).toBe('toString');
    expect(translate('hello', {})).toBe('Hello {constructor}');
});
it('invalid locale syntax falls back without throwing', () => expect(detect('not a locale', ['en'])).toBe('en'));
it('synchronous injected DOM writes preserve hydrate then user locale-change order',async()=>{
 const {createTestStore}=await import('../../src/lib/test/test-store.js');
 const dom={setLanguage:vi.fn(),setDirection:vi.fn()};const dependencies:I18nDependencies={dom,storage:createNoopStorage<string>(),translationLoader:new BundledTranslationLoader({bundles:{}}),localeDetector:createStaticLocaleDetector('en',['en','ar'])};
 const store=createTestStore({initialState:createInitialI18nState('en',['en','ar'],'en'),reducer:i18nReducer,dependencies});
 try{await store.send({type:'i18n/hydrate',state:createInitialI18nState('ar',['en','ar'],'en')});await store.send({type:'i18n/setLocale',locale:'en'});await store.finish();expect(dom.setLanguage.mock.calls).toEqual([['ar'],['en']]);expect(store.state.currentLocale).toBe('en');}finally{store.destroy();}
});
