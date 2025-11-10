/**
 * Routing configuration shared between server and client.
 *
 * This demonstrates how Composable Svelte's router works isomorphically:
 * - Server: Parse URL from request to determine initial state
 * - Client: Sync state with browser history API
 */

import { parseDestination, matchPath, serializeDestination } from '@composable-svelte/core/routing';
import type { ParserConfig, SerializerConfig } from '@composable-svelte/core/routing';

/**
 * Post destination (for /posts/:id routes).
 */
export type PostDestination = {
  type: 'post';
  state: { postId: number };
};

/**
 * Parser configuration for blog routes.
 *
 * Handles:
 * - / (root) → null (show first post)
 * - /posts/:id → { type: 'post', state: { postId } }
 */
export const parserConfig: ParserConfig<PostDestination> = {
  basePath: '/',
  parsers: [
    // Match /posts/:id
    (path) => {
      const params = matchPath('/posts/:id', path);
      if (params) {
        const postId = parseInt(params.id, 10);
        if (!isNaN(postId)) {
          return { type: 'post', state: { postId } };
        }
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
export const serializerConfig: SerializerConfig<PostDestination> = {
  basePath: '/',
  serializers: {
    post: (state) => `/posts/${state.postId}`
  }
};

/**
 * Parse URL path to determine initial selected post.
 *
 * This is a **pure function** that works on both server and client!
 *
 * @param path - URL path from request (server) or window.location (client)
 * @param defaultPostId - Fallback post ID if no route matches
 * @returns Post ID to select
 *
 * @example
 * ```typescript
 * // Server-side (Fastify)
 * const postId = parsePostFromURL(request.url, 1);
 *
 * // Client-side
 * const postId = parsePostFromURL(window.location.pathname, 1);
 * ```
 */
export function parsePostFromURL(path: string, defaultPostId: number): number {
  const destination = parseDestination(path, parserConfig);
  return destination?.state.postId ?? defaultPostId;
}

/**
 * Generate URL for a post ID.
 *
 * @param postId - Post ID to link to
 * @returns URL path
 */
export function postURL(postId: number): string {
  return serializeDestination({ type: 'post', state: { postId } }, serializerConfig);
}
