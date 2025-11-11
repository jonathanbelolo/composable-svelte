/**
 * Routing configuration shared between server and client.
 *
 * This demonstrates how Composable Svelte's router works isomorphically:
 * - Server: Parse URL from request to determine initial state
 * - Client: Sync state with browser history API
 *
 * Routes:
 * - / → List page (all posts)
 * - /posts/:id → Post detail page
 * - /posts/:id/comments → Post comments page (nested route)
 */

import { parseDestination, matchPath, serializeDestination } from '@composable-svelte/core/routing';
import type { ParserConfig, SerializerConfig } from '@composable-svelte/core/routing';
import type { AppDestination } from './types';

/**
 * Parser configuration for blog routes.
 *
 * Handles three routes (in order of specificity):
 * - /posts/:id/comments → comments destination (nested route)
 * - /posts/:id → post destination
 * - / → list destination
 */
export const parserConfig: ParserConfig<AppDestination> = {
  basePath: '/',
  parsers: [
    // Match posts/:id/comments (most specific first!)
    // Note: basePath is stripped, so relative path doesn't have leading /
    (path) => {
      const params = matchPath('posts/:id/comments', path);
      if (params) {
        const postId = parseInt(params.id, 10);
        if (!isNaN(postId)) {
          return { type: 'comments', state: { postId } };
        }
      }
      return null;
    },
    // Match posts/:id
    (path) => {
      const params = matchPath('posts/:id', path);
      if (params) {
        const postId = parseInt(params.id, 10);
        if (!isNaN(postId)) {
          return { type: 'post', state: { postId } };
        }
      }
      return null;
    },
    // Match / (root - list page)
    (path) => {
      if (path === '/' || path === '') {
        return { type: 'list' };
      }
      return null;
    }
  ]
};

/**
 * Serializer configuration for blog routes.
 *
 * Maps destination state back to URLs for client-side navigation.
 */
export const serializerConfig: SerializerConfig<AppDestination> = {
  basePath: '/',
  serializers: {
    list: () => '/',
    post: (state) => `/posts/${state.postId}`,
    comments: (state) => `/posts/${state.postId}/comments`
  }
};

/**
 * Parse URL path to determine destination.
 *
 * This is a **pure function** that works on both server and client!
 *
 * @param path - URL path from request (server) or window.location (client)
 * @returns Destination (defaults to list if no match)
 *
 * @example
 * ```typescript
 * // Server-side (Fastify)
 * const destination = parseDestinationFromURL(request.url);
 *
 * // Client-side
 * const destination = parseDestinationFromURL(window.location.pathname);
 * ```
 */
export function parseDestinationFromURL(path: string): AppDestination {
  const destination = parseDestination(path, parserConfig);
  return destination ?? { type: 'list' };
}

/**
 * Generate URL from destination.
 *
 * @param destination - Destination to serialize
 * @returns URL path
 */
export function destinationURL(destination: AppDestination): string {
  return serializeDestination(destination, serializerConfig);
}

/**
 * Helper: Generate URL for list page.
 */
export function listURL(): string {
  return '/';
}

/**
 * Helper: Generate URL for post detail page.
 */
export function postURL(postId: number): string {
  return `/posts/${postId}`;
}

/**
 * Helper: Generate URL for post comments page.
 */
export function commentsURL(postId: number): string {
  return `/posts/${postId}/comments`;
}
