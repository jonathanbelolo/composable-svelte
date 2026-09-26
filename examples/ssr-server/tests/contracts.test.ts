import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createStore } from '@composable-svelte/core';
import { createInitialAppState } from '../src/shared/initial-state';
import { parseDestinationFromURL, postURL, commentsURL } from '../src/shared/routing';
import { computeMeta } from '../src/shared/meta';
import { createNoopStorage } from '@composable-svelte/core/dependencies';
import { BundledTranslationLoader, createStaticLocaleDetector, serverDOM } from '@composable-svelte/core/i18n';
import { appReducer, type AppDependencies } from '../src/shared/reducer';
import { loadPosts, loadAllComments } from '../src/server/data';

const posts = await loadPosts();
const comments = await loadAllComments();
const dependencies: AppDependencies = {
  fetchPosts: async () => posts,
  translationLoader: new BundledTranslationLoader({ bundles: { en: { common: {} } } }),
  localeDetector: createStaticLocaleDetector('en', ['en', 'fr', 'es']),
  storage: createNoopStorage<string>(), dom: serverDOM
};

test('locale and query parsing selects the exact route, and malformed IDs are not posts', () => {
  for (const prefix of ['', '/en', '/fr', '/es']) {
    assert.deepEqual(parseDestinationFromURL(`${prefix}/posts/1/comments?source=email#details`), { type: 'comments', state: { postId: 1 } });
    assert.deepEqual(parseDestinationFromURL(`${prefix}/posts/2?lang=fr`), { type: 'post', state: { postId: 2 } });
  }
  for (const path of ['/unknown', '/fr/missing', '/posts/1oops', '/posts/-1', '/posts/9007199254740993', '/404']) {
    assert.equal(parseDestinationFromURL(path).type, 'notFound', path);
  }
  assert.equal(postURL(1, 'fr'), '/fr/posts/1');
  assert.equal(commentsURL(1, 'es'), '/es/posts/1/comments');
});

test('initial state marks missing posts not found and keeps all snapshot comments', () => {
  const state = createInitialAppState({ path: '/fr/posts/999?source=email', locale: 'fr', posts, comments });
  assert.equal(state.destination.type, 'notFound');
  assert.equal(state.routeSearch, '?source=email');
  assert.deepEqual(state.comments, comments);
  assert.match(state.meta.title, /Not Found/);
});

test('comment replacement belongs to its requested post, including empty and out-of-order results', () => {
  const state = createInitialAppState({ path: '/', posts, comments });
  const [second] = appReducer(state, { type: 'commentsLoaded', postId: 2, comments: [] }, dependencies);
  assert.deepEqual(second.comments.filter(comment => comment.postId === 1), comments.filter(comment => comment.postId === 1));
  assert.equal(second.comments.some(comment => comment.postId === 2), false);
  const [first] = appReducer(second, { type: 'commentsLoaded', postId: 1, comments: comments.filter(comment => comment.postId === 1) }, dependencies);
  assert.equal(first.comments.some(comment => comment.postId === 2), false);
  assert.deepEqual(first.comments.filter(comment => comment.postId === 1), comments.filter(comment => comment.postId === 1));
});

test('async comments retain the requested partition after navigation changes', { timeout: 2000 }, async () => {
  let release!: (value: typeof comments) => void;
  const pending = new Promise<typeof comments>(resolve => { release = resolve; });
  const store = createStore({
    initialState: createInitialAppState({ path: '/', posts, comments: [] }), reducer: appReducer,
    dependencies: { ...dependencies, fetchComments: async () => pending },
    ssr: { deferEffects: false }
  });
  try {
    store.dispatch({ type: 'navigate', destination: { type: 'comments', state: { postId: 1 } } });
    store.dispatch({ type: 'navigate', destination: { type: 'post', state: { postId: 2 } } });
    const settled = new Promise<void>(resolve => {
      const unsubscribe = store.subscribe(state => {
        if (state.comments.length) { unsubscribe(); resolve(); }
      });
    });
    release(comments.filter(comment => comment.postId === 1));
    await settled;
    assert.deepEqual(store.state.destination, { type: 'post', state: { postId: 2 } });
    assert.ok(store.state.comments.every(comment => comment.postId === 1));
  } finally { store.destroy(); }
});

test('metadata strips demo content markup before truncating and keeps locale canonical ownership', () => {
  const meta = computeMeta({ type: 'post', state: { postId: 1 } }, posts, comments, 'fr');
  assert.equal(meta.canonical, 'https://example.com/fr/posts/1');
  assert.doesNotMatch(meta.description, /<[^>]*>/);
  assert.ok(meta.description.length <= 160);
});

test('generated pages have one title/canonical and matching document language, including 404', async () => {
  async function files(directory: string): Promise<string[]> {
    const entries = await readdir(directory, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]))).flat();
  }
  const pages = (await files('static')).filter(file => file.endsWith('.html'));
  assert.equal(pages.length, 34);
  for (const file of pages) {
    const html = await readFile(file, 'utf8');
    const segments = relative('static', file).split(sep);
    const locale = segments[0] === 'fr' ? 'fr' : segments[0] === 'es' ? 'es' : 'en';
    const route = segments.length === 1 ? (segments[0] === '404.html' ? '/404' : '/')
      : '/' + segments.slice(0, -1).join('/') + (segments.length === 2 && locale !== 'en' ? '/' : '');
    assert.equal((html.match(/<title>/g) ?? []).length, 1, file);
    assert.equal((html.match(/rel="canonical"/g) ?? []).length, 1, file);
    assert.ok(html.includes(`<html lang="${locale}">`), file);
    assert.ok(html.includes(`href="https://example.com${route}"`), file);
    assert.ok(!html.includes('<title>Composable Svelte App</title>'), file);
    assert.doesNotMatch(html, /<meta[^>]+content="(?:\s|&lt;)*(?:&lt;p|&lt;strong)/);
  }
  assert.match(await readFile('static/404.html', 'utf8'), /class="not-found/);
  assert.doesNotMatch(await readFile('static/404.html', 'utf8'), /class="post-card/);
});

// Execute the real entry with boundary faults; do not duplicate its cleanup logic.
test('client enrollment destroys its allocated store when history attachment or hydration fails', async () => {
  const ts = await import('typescript');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile('src/client/index.ts', 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    transformers: { before: [context => root => {
      const visit: import('typescript').Visitor = node => ts.isMetaProperty(node)
        ? ts.factory.createObjectLiteralExpression([])
        : ts.visitEachChild(node, visit, context);
      return ts.visitEachChild(root, visit, context);
    }] }
  }).outputText;
  for (const failAt of ['history', 'hydrate'] as const) {
    const calls: string[] = [];
    const failure = new Error(failAt);
    const store = { destroy: () => { calls.push('destroy'); } };
    const modules: Record<string, unknown> = {
      'svelte': { hydrate: () => { calls.push('hydrate'); throw failure; }, unmount: () => {} },
      '@composable-svelte/core/ssr': { hydrateStore: () => store },
      '@composable-svelte/core/routing': { syncBrowserHistory: () => {
        calls.push('attach');
        if (failAt === 'history') throw failure;
        return () => { calls.push('detach'); };
      } },
      '@composable-svelte/core/dependencies': { createLocalStorage: () => ({}) },
      '@composable-svelte/core/i18n': { BundledTranslationLoader: class {}, createStaticLocaleDetector: () => ({}), browserDOM: {} }
    };
    const errors: unknown[] = [];
    const element = () => ({ setAttribute() {}, append() {}, textContent: '' });
    runInNewContext(compiled, {
      exports: {}, URLSearchParams,
      require: (id: string) => {
        if (id in modules) return modules[id];
        if (id.startsWith('../')) return {};
        throw new Error(`Unexpected import: ${id}`);
      },
      console: { log() {}, error: (...args: unknown[]) => errors.push(args) },
      document: { readyState: 'complete', getElementById: () => ({ textContent: JSON.stringify({ i18n: { currentLocale: 'en' } }) }),
        createElement: element, body: { replaceChildren() {} } }
    });
    assert.deepEqual(calls, failAt === 'history' ? ['attach', 'destroy'] : ['attach', 'hydrate', 'detach', 'destroy']);
    assert.equal(errors.length, 1);
  }
});
