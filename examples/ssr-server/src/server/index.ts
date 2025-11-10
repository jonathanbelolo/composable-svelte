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
import { parsePostFromURL } from '../shared/routing';

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
 * This demonstrates the complete SSR flow with routing:
 * 1. Parse URL to determine which post to show
 * 2. Load data on the server
 * 3. Create store with URL-driven state
 * 4. Render component to HTML
 * 5. Send response with embedded state
 */
async function renderApp(request: any, reply: any) {
  try {
    // 1. Parse URL using router (same logic as client!)
    const posts = await loadPosts();
    // Use request.routeOptions.url or request.url to get the path
    const path = request.routeOptions?.url || request.url;
    const requestedPostId = parsePostFromURL(path, posts[0]?.id || 1);

    // Find the requested post
    const selectedPost = posts.find((p) => p.id === requestedPostId) || posts[0];

    // 2. Create store with URL-driven state
    // Note: dependencies is empty because effects won't run on server
    const store = createStore({
      initialState: {
        ...initialState,
        posts,
        selectedPostId: selectedPost?.id || null,
        // Set initial meta based on URL-selected post
        meta: selectedPost
          ? {
              title: `${selectedPost.title} - Composable Svelte Blog`,
              description: selectedPost.content.slice(0, 160),
              ogImage: `/og/post-${selectedPost.id}.jpg`,
              canonical: `https://example.com/posts/${selectedPost.id}`
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
}

// Register routes - handle both / and /posts/:id with the same handler
app.get('/', renderApp);
app.get('/posts/:id', renderApp);

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
