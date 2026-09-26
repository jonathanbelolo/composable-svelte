/** Build a read-only, localized demo snapshot using the framework generator. */
import { generateStaticSite } from '@composable-svelte/core/ssr/ssg';
import { createNoopStorage } from '@composable-svelte/core/dependencies';
import { BundledTranslationLoader, createStaticLocaleDetector, serverDOM } from '@composable-svelte/core/i18n';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cp, mkdir, rm } from 'node:fs/promises';
import App from '../shared/App.svelte';
import { appReducer, type AppDependencies } from '../shared/reducer';
import { loadPosts, loadAllComments, loadCommentsByPostId } from '../server/data';
import { createInitialAppState } from '../shared/initial-state';
import { SUPPORTED_LOCALES, extractLocaleAndCleanPath, listURL, postURL, commentsURL } from '../shared/routing';
import en from '../locales/en/common.json';
import fr from '../locales/fr/common.json';
import es from '../locales/es/common.json';

const directory = dirname(fileURLToPath(import.meta.url));
async function build() {
  const outDir = join(directory, '../../static');
  // Generated output is rebuilt, never manually patched or left partially stale.
  await rm(outDir, { recursive: true, force: true });
  await mkdir(join(outDir, 'assets'), { recursive: true });
  await cp(join(directory, '../client'), join(outDir, 'assets'), { recursive: true });
  const [posts, comments] = await Promise.all([loadPosts(), loadAllComments()]);
  const translationLoader = new BundledTranslationLoader({ bundles: {
    en: { common: en }, fr: { common: fr }, es: { common: es }
  }});
  async function stateFor(path: string) {
    const locale = extractLocaleAndCleanPath(path).locale ?? 'en';
    const translations = await translationLoader.load('common', locale);
    return createInitialAppState({ path, locale, posts, comments,
      translations: translations ? { [`${locale}:common`]: translations } : {} });
  }
  const routes = SUPPORTED_LOCALES.flatMap(locale => [
    { path: listURL(locale), getServerProps: stateFor },
    ...posts.flatMap(post => [
      { path: postURL(post.id, locale), getServerProps: stateFor },
      { path: commentsURL(post.id, locale), getServerProps: stateFor }
    ])
  ]);
  const result = await generateStaticSite(App, {
    routes, outDir, notFoundState: await stateFor('/404')
    // App owns canonical links; omit generator baseURL to keep one owner.
  }, {
    reducer: appReducer,
    dependencies: { fetchPosts: loadPosts, fetchComments: loadCommentsByPostId,
      translationLoader, localeDetector: createStaticLocaleDetector('en', [...SUPPORTED_LOCALES]),
      storage: createNoopStorage<string>(), dom: serverDOM } satisfies AppDependencies,
    renderOptions: state => ({ title: null, lang: state.i18n.currentLocale,
      head: '<link rel="stylesheet" href="/assets/index.css">', clientScript: '/assets/index.js' })
  });
  if (result.errors.length) throw new AggregateError(result.errors.map(entry => entry.error), 'Static generation failed');
  console.log(`Generated ${result.pagesGenerated} pages including the not-found page.`);
}
await build();
