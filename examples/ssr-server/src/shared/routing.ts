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

import { createParserConfig, parseDestination, serializeDestination } from '@composable-svelte/core/routing';
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
export const parserConfig: ParserConfig<AppDestination> = createParserConfig<AppDestination>(
  {
    // Keys are tried in insertion order, so the most specific comes first.
    //
    // Patterns carry their leading slash. `parseDestination` strips `basePath`
    // and, when that is '/', hands the parser a path with no leading slash —
    // which is why this file used to write `posts/:id` and say so in a comment.
    // `createParserConfig` normalises, so patterns look the same either way.
    '/posts/:id/comments': (params) => {
      const postId = parseInt(params.id ?? '', 10);
      return isNaN(postId) ? null : { type: 'comments', state: { postId } };
    },
    '/posts/:id': (params) => {
      const postId = parseInt(params.id ?? '', 10);
      // Declining after the pattern matched: '/posts/abc' is not a post route,
      // and returning null lets the next parser try.
      return isNaN(postId) ? null : { type: 'post', state: { postId } };
    },
    '/': () => ({ type: 'list', state: {} })
  },
  { basePath: '/' }
);

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
  return destination ?? { type: 'list', state: {} };
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
