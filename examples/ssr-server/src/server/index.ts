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
import App from '../shared/App.svelte';
import { appReducer } from '../shared/reducer';
import type { AppDependencies } from '../shared/reducer';
import { initialState } from '../shared/types';
import { loadPosts, loadAllComments, loadCommentsByPostId } from './data';
import { parseDestinationFromURL } from '../shared/routing';

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
 * Main SSR route handler.
 * This demonstrates the complete SSR flow with routing:
 * 1. Parse URL to determine destination (list, post, or comments)
 * 2. Load data on the server
 * 3. Compute initial meta tags based on destination
 * 4. Create store with URL-driven state
 * 5. Render component to HTML
 * 6. Send response with embedded state
 */
async function renderApp(request: any, reply: any) {
  try {
    // 1. Parse URL using router (same logic as client!)
    const path = request.url;
    const destination = parseDestinationFromURL(path);

    // 2. Load data based on destination
    const posts = await loadPosts();

    // For comments route, preload comments for the specific post
    // For other routes, load all comments (demonstrates different strategies)
    const comments =
      destination.type === 'comments'
        ? await loadCommentsByPostId(destination.state.postId)
        : await loadAllComments();

    // 3. Compute initial meta tags based on destination
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

    // 4. Create store with URL-driven state
    const store = createStore({
      initialState: {
        ...initialState,
        posts,
        comments,
        destination,
        meta
      },
      reducer: appReducer,
      dependencies: {
        fetchPosts: loadPosts,
        fetchComments: loadCommentsByPostId
      } as AppDependencies
      // ssr.deferEffects defaults to true, so effects are automatically skipped
    });

    // 5. Render component to HTML
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

    // 6. Send response
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
