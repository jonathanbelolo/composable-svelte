/**
 * Fastify server with Server-Side Rendering.
 *
 * This demonstrates how to use Composable Svelte's SSR capabilities
 * with a modern Node.js framework.
 */

import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createStore } from '@composable-svelte/core';
import { renderToHTML } from '@composable-svelte/core/ssr';
import { fastifySecurityHeaders, fastifyRateLimit } from '@composable-svelte/core/ssr/middleware';
import { BundledTranslationLoader, createStaticLocaleDetector, createSSRLocaleDetector, serverDOM } from '@composable-svelte/core/i18n';
import { createNoopStorage } from '@composable-svelte/core/dependencies';
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import { createInitialAppState } from '../shared/initial-state';
import { loadPosts, loadAllComments, loadCommentsByPostId } from './data';
import { extractLocaleAndCleanPath, SUPPORTED_LOCALES } from '../shared/routing';

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


/** Path locale wins; otherwise use core's query/header detector, then English. */
function detectLocale(request: FastifyRequest): string {
  return extractLocaleAndCleanPath(request.url).locale ?? createSSRLocaleDetector({
    supportedLocales: [...SUPPORTED_LOCALES], defaultLocale: 'en',
    url: new URL(request.url, 'https://example.com').href,
    cookies: '', acceptLanguage: request.headers['accept-language'] ?? ''
  }).detect();
}

const translationLoader = new BundledTranslationLoader({ bundles: {
  en: { common: enTranslations }, fr: { common: frTranslations }, es: { common: esTranslations }
}});

async function renderApp(request: FastifyRequest, reply: FastifyReply) {
  try {
    const locale = detectLocale(request);
    const [posts, comments, translations] = await Promise.all([
      loadPosts(), loadAllComments(), translationLoader.load('common', locale)
    ]);
    const state = createInitialAppState({ path: request.url, locale, posts, comments,
      translations: translations ? { [`${locale}:common`]: translations } : {} });
    const store = createStore({ initialState: state, reducer: appReducer, dependencies: {
      fetchPosts: loadPosts, fetchComments: loadCommentsByPostId, translationLoader,
      localeDetector: createStaticLocaleDetector(locale, [...SUPPORTED_LOCALES]),
      storage: createNoopStorage<string>(), dom: serverDOM
    } satisfies AppDependencies });
    try {
      const html = renderToHTML(App, { store }, {
        // App owns its title/canonical; the document wrapper owns language.
        title: null, lang: locale,
        head: '<link rel="stylesheet" href="/assets/index.css">',
        clientScript: '/assets/index.js'
      });
      return reply.code(state.destination.type === 'notFound' ? 404 : 200).type('text/html').send(html);
    } finally { store.destroy(); }
  } catch (error) {
    request.log.error(error);
    return reply.code(500).send({ error: 'Internal Server Error' });
  }
}

app.get('/', renderApp);
app.get('/*', renderApp);

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
