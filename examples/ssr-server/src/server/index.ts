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
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import { initialState } from '../shared/types';
import { loadPosts } from './data';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Fastify instance
const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Serve static files (client bundle)
const clientDir = join(__dirname, '../client');
app.register(fastifyStatic, {
  root: clientDir,
  prefix: '/assets/'
});

/**
 * Main SSR route handler.
 * This demonstrates the complete SSR flow:
 * 1. Load data on the server
 * 2. Create store with pre-populated state
 * 3. Render component to HTML
 * 4. Send response with embedded state
 */
app.get('/', async (request, reply) => {
  try {
    // 1. Load data for this request (server-side only)
    // In a real app, this might include user-specific data, etc.
    const posts = await loadPosts();

    // 2. Create store with pre-populated data
    // Note: dependencies is empty because effects won't run on server
    const firstPost = posts[0];
    const store = createStore({
      initialState: {
        ...initialState,
        posts,
        selectedPostId: firstPost?.id || null,
        // Set initial meta for the first post (computed in state, not in template!)
        meta: firstPost
          ? {
              title: `${firstPost.title} - Composable Svelte Blog`,
              description: firstPost.content.slice(0, 160),
              ogImage: `/og/post-${firstPost.id}.jpg`,
              canonical: `https://example.com/posts/${firstPost.id}`
            }
          : initialState.meta
      },
      reducer: appReducer,
      dependencies: {} as AppDependencies
      // ssr.deferEffects defaults to true, so effects are automatically skipped
    });

    // 3. Render component to HTML
    // Note: Title and meta tags are now handled by <svelte:head> in App.svelte!
    // This demonstrates state-driven meta tags computed by the reducer.
    const html = renderToHTML(App, { store }, {
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
    });

    // 4. Send response
    reply.type('text/html').send(html);
  } catch (error) {
    request.log.error(error);
    reply.status(500).send({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

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
