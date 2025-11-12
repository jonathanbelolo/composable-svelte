/**
 * Fastify server with Server-Side Rendering.
 *
 * This demonstrates how to use Composable Svelte's SSR capabilities
 * with a modern Node.js framework.
 */

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createStore } from '@composable-svelte/core';
import { renderToHTML } from '@composable-svelte/core/ssr';
import { fastifySecurityHeaders, fastifyRateLimit } from '@composable-svelte/core/ssr';
import { createInitialI18nState, BundledTranslationLoader, createStaticLocaleDetector, serverDOM } from '@composable-svelte/core/i18n';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import { initialState } from '../shared/types';
import { loadPosts, loadAllComments, loadCommentsByPostId } from './data';
import { parseDestinationFromURL } from '../shared/routing';

// Import translation files
import enTranslations from '../locales/en/common.json';
import frTranslations from '../locales/fr/common.json';
import esTranslations from '../locales/es/common.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Fastify instance
const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Apply security middleware
fastifySecurityHeaders(app, {
  contentSecurityPolicy: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:",
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  hsts: { maxAge: 31536000, includeSubDomains: true }
});

// Apply rate limiting
fastifyRateLimit(app, {
  max: 100,          // 100 requests
  windowMs: 60000,   // per minute
  message: 'Too many requests from this IP, please try again later.'
});

// Serve static files (client bundle)
const clientDir = join(__dirname, '../client');
app.register(fastifyStatic, {
  root: clientDir,
  prefix: '/assets/'
});


/**
 * Detect locale from request.
 * Priority: 1. Query param (?lang=fr), 2. Accept-Language header, 3. Default (en)
 */
function detectLocale(request: any): string {
  // Safety check
  if (!request) {
    return 'en';
  }

  // 1. Check query param
  const queryLang = request.query?.lang;
  if (queryLang && ['en', 'fr', 'es'].includes(queryLang)) {
    return queryLang;
  }

  // 2. Check Accept-Language header
  // In Fastify, headers are automatically lowercased
  const acceptLanguage = request.headers?.['accept-language'];
  if (acceptLanguage && typeof acceptLanguage === 'string') {
    // Parse Accept-Language header (e.g., "fr-FR,fr;q=0.9,en;q=0.8")
    const languages = acceptLanguage
      .split(',')
      .map((lang: string) => {
        const [code] = lang.trim().split(';');
        return code.split('-')[0]; // Extract language code (fr from fr-FR)
      });

    // Find first supported language
    for (const lang of languages) {
      if (['en', 'fr', 'es'].includes(lang)) {
        return lang;
      }
    }
  }

  // 3. Default to English
  return 'en';
}

/**
 * Main SSR route handler.
 * This demonstrates the complete SSR flow with routing and i18n:
 * 1. Parse URL to determine destination (list, post, or comments)
 * 2. Detect locale and initialize i18n
 * 3. Load data on the server
 * 4. Compute initial meta tags based on destination
 * 5. Create store with URL-driven state and i18n
 * 6. Render component to HTML
 * 7. Send response with embedded state
 */
async function renderApp(request: any, reply: any) {
  try {
    // 1. Parse URL using router (same logic as client!)
    const path = request.url;
    const destination = parseDestinationFromURL(path);

    // 2. Detect locale and initialize i18n (manual setup for Fastify)
    const locale = detectLocale(request);
    const i18nState = createInitialI18nState(locale, ['en', 'fr', 'es'], 'en');

    // Create translation loader
    const translationLoader = new BundledTranslationLoader({
      bundles: {
        en: { common: enTranslations },
        fr: { common: frTranslations },
        es: { common: esTranslations }
      }
    });

    // Preload common namespace
    const translations = await translationLoader.load('common', locale);
    const updatedI18nState = {
      ...i18nState,
      translations: {
        [`${locale}:common`]: translations
      }
    };

    // Create SSR-safe mock storage
    const mockStorage = {
      getItem: (key: string) => null,
      setItem: (key: string, value: unknown) => {}, // No-op on server
      removeItem: (key: string) => {},
      keys: () => [],
      has: (key: string) => false,
      clear: () => {}
    };

    // Create i18n dependencies for the store
    const i18nDependencies = {
      translationLoader,
      localeDetector: createStaticLocaleDetector(locale, ['en', 'fr', 'es']),
      storage: mockStorage,
      dom: serverDOM
    };

    // 3. Load data based on destination
    const posts = await loadPosts();

    // For comments route, preload comments for the specific post
    // For other routes, load all comments (demonstrates different strategies)
    const comments =
      destination.type === 'comments'
        ? await loadCommentsByPostId(destination.state.postId)
        : await loadAllComments();

    // 4. Compute initial meta tags based on destination
    let meta = initialState.meta;

    if (destination.type === 'list') {
      meta = {
        title: 'Blog Posts - Composable Svelte SSR',
        description: 'Server-Side Rendered blog with Composable Svelte and Fastify',
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

    // 5. Create store with URL-driven state and i18n
    const store = createStore({
      initialState: {
        ...initialState,
        posts,
        comments,
        destination,
        meta,
        i18n: updatedI18nState
      },
      reducer: appReducer,
      dependencies: {
        fetchPosts: loadPosts,
        fetchComments: loadCommentsByPostId,
        ...i18nDependencies
      } as AppDependencies
      // ssr.deferEffects defaults to true, so effects are automatically skipped
    });

    // 6. Render component to HTML
    // Note: Title and meta tags are handled by <svelte:head> in App.svelte!
    // This demonstrates state-driven meta tags.
    const html = renderToHTML(
      App,
      { store },
      {
        head: `
        <link rel="stylesheet" href="/assets/index.css">
        <style>
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
        </style>
      `,
        clientScript: '/assets/index.js'
      }
    );

    // 7. Send response
    reply.type('text/html').send(html);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Register routes - handle all three routes with the same handler
app.get('/', renderApp);
app.get('/posts/:id', renderApp);
app.get('/posts/:id/comments', renderApp);

/**
 * Health check endpoint
 */
app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

/**
 * Start the server
 */
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
    const host = process.env.HOST || '0.0.0.0';

    await app.listen({ port, host });

    console.log('');
    console.log('🚀 Composable Svelte SSR Server');
    console.log('');
    console.log(`   Local:   http://localhost:${port}`);
    console.log(`   Network: http://${host}:${port}`);
    console.log('');
    console.log('📝 Press Ctrl+C to stop');
    console.log('');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
