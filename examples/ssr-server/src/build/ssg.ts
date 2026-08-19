/**
 * Static Site Generation (SSG) build script.
 *
 * This script generates static HTML files for the blog application.
 * It demonstrates:
 * - Full-site static generation
 * - Dynamic route pre-rendering
 * - Data loading at build time
 * - Multi-language support
 *
 * Usage:
 *   pnpm build:ssg
 */

import { generateStaticSite } from '@composable-svelte/core/ssr/ssg';
import { createNoopStorage } from '@composable-svelte/core/dependencies';
import {
  createInitialI18nState,
  BundledTranslationLoader,
  createStaticLocaleDetector,
  serverDOM
} from '@composable-svelte/core/i18n';
import type { I18nState } from '@composable-svelte/core/i18n';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { cp, mkdir } from 'fs/promises';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import type { AppState } from '../shared/types';
import { initialState } from '../shared/types';
import { loadPosts, loadAllComments, loadCommentsByPostId } from '../server/data';
import { parseDestinationFromURL } from '../shared/routing';

// Import translation files
import enTranslations from '../locales/en/common.json';
import frTranslations from '../locales/fr/common.json';
import esTranslations from '../locales/es/common.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Main SSG build function.
 */
async function build() {
  console.log('');
  console.log('🏗️  Starting Static Site Generation...');
  console.log('');

  const startTime = Date.now();

  // Copy client assets to static folder
  const staticDir = join(__dirname, '../../static');
  const clientDir = join(__dirname, '../../dist/client');
  const assetsDir = join(staticDir, 'assets');

  console.log('📦 Copying client assets...');
  await mkdir(assetsDir, { recursive: true });
  await cp(join(clientDir, 'index.css'), join(assetsDir, 'index.css'));
  await cp(join(clientDir, 'index.js'), join(assetsDir, 'index.js'));
  console.log('  ✓ CSS and JS copied to static/assets/');
  console.log('');

  // Load data once at build time
  const posts = await loadPosts();
  const allComments = await loadAllComments();

  // Supported locales
  const supportedLocales = ['en', 'fr', 'es'];

  // Create translation loader
  const translationLoader = new BundledTranslationLoader({
    bundles: {
      en: { common: enTranslations },
      fr: { common: frTranslations },
      es: { common: esTranslations }
    }
  });

  // SSR-safe storage: the library's own no-op implementation.
  const mockStorage = createNoopStorage<string>();

  /**
   * Helper to create initial state for a given path and locale.
   */
  async function getInitialState(path: string, locale: string): Promise<AppState> {
    // Parse URL to determine destination
    const destination = parseDestinationFromURL(path);

    // Initialize i18n
    const i18nState = createInitialI18nState(locale, supportedLocales, 'en');

    // Preload translations for this locale
    const translations = await translationLoader.load('common', locale);
    // `TranslationLoader.load` returns null when the namespace is missing; the
    // annotation puts the failure here rather than 70 lines later at createStore.
    const updatedI18nState: I18nState = {
      ...i18nState,
      translations: translations ? { [`${locale}:common`]: translations } : {}
    };

    // Load comments based on destination
    let comments = allComments;
    if (destination.type === 'comments') {
      comments = await loadCommentsByPostId(destination.state.postId);
    }

    // Compute meta tags based on destination
    let meta = initialState.meta;

    if (destination.type === 'list') {
      meta = {
        title: 'Blog Posts - Composable Svelte SSG',
        description: 'Statically generated blog with Composable Svelte',
        canonical: 'https://example.com/'
      };
    } else if (destination.type === 'post') {
      const post = posts.find((p) => p.id === destination.state.postId);
      if (post) {
        meta = {
          title: `${post.title} - Composable Svelte Blog`,
          description: post.content.slice(0, 160),
          ogImage: `/og/post-${post.id}.jpg`,
          canonical: `https://example.com/posts/${post.id}`
        };
      }
    } else if (destination.type === 'comments') {
      const post = posts.find((p) => p.id === destination.state.postId);
      const commentCount = comments.filter((c) => c.postId === destination.state.postId).length;
      if (post) {
        meta = {
          title: `Comments on "${post.title}" - Composable Svelte Blog`,
          description: `Read ${commentCount} comments on ${post.title}`,
          canonical: `https://example.com/posts/${post.id}/comments`
        };
      }
    }

    return {
      ...initialState,
      posts,
      comments,
      destination,
      meta,
      i18n: updatedI18nState
    };
  }

  // Generate routes for each locale
  const routes = [];

  for (const locale of supportedLocales) {
    const localePrefix = locale === 'en' ? '' : `/${locale}`;

    // Home page
    routes.push({
      path: `${localePrefix}/`,
      getServerProps: async (path: string) => {
        return getInitialState('/', locale);
      }
    });

    // Post detail pages
    for (const post of posts) {
      routes.push({
        path: `${localePrefix}/posts/${post.id}`,
        getServerProps: async (path: string) => {
          return getInitialState(`/posts/${post.id}`, locale);
        }
      });

      // Comments pages
      routes.push({
        path: `${localePrefix}/posts/${post.id}/comments`,
        getServerProps: async (path: string) => {
          return getInitialState(`/posts/${post.id}/comments`, locale);
        }
      });
    }
  }

  // Run SSG
  const result = await generateStaticSite(App, {
    routes,
    outDir: join(__dirname, '../../static'),
    baseURL: 'https://example.com',
    // Without this, core falls back to `{}` for the 404 page and App crashes on
    // `state.destination.type`. That failure was swallowed into result.errors,
    // so no 404.html has ever been produced.
    notFoundState: await getInitialState('/404', 'en'),
    onPageGenerated: (path, outPath) => {
      console.log(`  ✓ ${path} → ${outPath}`);
    }
  }, {
    reducer: appReducer,
    dependencies: {
      fetchPosts: loadPosts,
      fetchComments: loadCommentsByPostId,
      translationLoader,
      localeDetector: createStaticLocaleDetector('en', supportedLocales),
      storage: mockStorage,
      dom: serverDOM
    } satisfies AppDependencies,
    renderOptions: {
      head: '<link rel="stylesheet" href="/assets/index.css">',
      clientScript: '/assets/index.js'
    }
  });

  const duration = Date.now() - startTime;

  console.log('');
  console.log('✅ Static Site Generation Complete!');
  console.log('');
  console.log(`  Pages generated: ${result.pagesGenerated}`);
  console.log(`  Total time: ${duration}ms`);
  console.log(`  Output directory: ${join(__dirname, '../../static')}`);

  if (result.errors.length > 0) {
    console.log('');
    console.log(`⚠️  ${result.errors.length} errors occurred:`);
    for (const { path, error } of result.errors) {
      console.log(`  - ${path}: ${error.message}`);
    }
  }

  console.log('');
}

// Run build
build().catch((error) => {
  console.error('');
  console.error('❌ SSG build failed:', error);
  console.error('');
  process.exit(1);
});
