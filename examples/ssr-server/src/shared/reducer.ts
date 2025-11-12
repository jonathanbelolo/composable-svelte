/**
 * Application reducer.
 * Shared between server and client.
 */

import { Effect, scope } from '@composable-svelte/core';
import { createURLSyncEffect } from '@composable-svelte/core/routing';
import type { Reducer } from '@composable-svelte/core';
import { i18nReducer, type I18nDependencies } from '@composable-svelte/core/i18n';
import type { AppState, AppAction } from './types';
import { destinationURL } from './routing';

export interface AppDependencies extends I18nDependencies {
  fetchPosts: () => Promise<any[]>;
  fetchComments?: (postId: number) => Promise<any[]>;
}

/**
 * Compute page meta based on destination.
 * This demonstrates reducer-driven meta tags!
 */
function computeMeta(state: AppState): AppState['meta'] {
  switch (state.destination.type) {
    case 'list':
      return {
        title: 'Blog Posts - Composable Svelte SSR',
        description: 'Server-Side Rendered blog with Composable Svelte and Fastify',
        canonical: 'https://example.com/'
      };

    case 'post': {
      const post = state.posts.find((p) => p.id === state.destination.state.postId);
      return post
        ? {
            title: `${post.title} - Composable Svelte Blog`,
            description: post.content.slice(0, 160),
            ogImage: `/og/post-${post.id}.jpg`,
            canonical: `https://example.com/posts/${post.id}`
          }
        : state.meta;
    }

    case 'comments': {
      const post = state.posts.find((p) => p.id === state.destination.state.postId);
      const commentCount = state.comments.filter((c) => c.postId === state.destination.state.postId).length;
      return post
        ? {
            title: `Comments on "${post.title}" - Composable Svelte Blog`,
            description: `Read ${commentCount} comments on ${post.title}`,
            canonical: `https://example.com/posts/${post.id}/comments`
          }
        : state.meta;
    }

    default:
      return state.meta;
  }
}

/**
 * Create URL sync effect.
 * This updates the browser URL when state changes.
 * Only runs on client (window is not defined on server).
 */
const urlSyncEffect = typeof window !== 'undefined'
  ? createURLSyncEffect<AppState, AppAction>((state) => destinationURL(state.destination))
  : () => Effect.none();

const coreReducer: Reducer<AppState, AppAction, AppDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'postsLoaded':
      return [
        {
          ...state,
          posts: action.posts,
          isLoading: false,
          error: null
        },
        Effect.none()
      ];

    case 'commentsLoaded':
      return [
        {
          ...state,
          comments: action.comments
        },
        Effect.none()
      ];

    case 'navigate': {
      // Update destination and recompute meta tags
      const newState = {
        ...state,
        destination: action.destination
      };

      // Recompute meta based on new destination
      const updatedState = {
        ...newState,
        meta: computeMeta(newState)
      };

      // If navigating to comments, fetch comments if needed
      if (
        action.destination.type === 'comments' &&
        deps.fetchComments &&
        !state.comments.some((c) => c.postId === action.destination.state.postId)
      ) {
        return [
          updatedState,
          Effect.run(async (dispatch) => {
            try {
              const comments = await deps.fetchComments!(action.destination.state.postId);
              dispatch({ type: 'commentsLoaded', comments });
            } catch (error) {
              console.error('Failed to load comments:', error);
            }
          })
        ];
      }

      return [updatedState, Effect.none()];
    }

    case 'loadPostsFailed':
      return [
        {
          ...state,
          isLoading: false,
          error: action.error
        },
        Effect.none()
      ];

    case 'refreshPosts':
      return [
        {
          ...state,
          isLoading: true,
          error: null
        },
        Effect.run(async (dispatch) => {
          try {
            const posts = await deps.fetchPosts();
            dispatch({ type: 'postsLoaded', posts });
          } catch (error) {
            dispatch({
              type: 'loadPostsFailed',
              error: error instanceof Error ? error.message : 'Failed to load posts'
            });
          }
        })
      ];

    default: {
      // Handle i18n actions by checking if type starts with 'i18n/'
      if (typeof action.type === 'string' && action.type.startsWith('i18n/')) {
        // Pass the action directly to i18n reducer
        const [newI18nState, i18nEffect] = i18nReducer(state.i18n, action as any, deps);
        return [
          { ...state, i18n: newI18nState },
          i18nEffect as Effect<AppAction>
        ];
      }

      return [state, Effect.none()];
    }
  }
};

/**
 * Wrapped reducer that includes URL sync.
 */
export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (
  state,
  action,
  deps
) => {
  // Run core reducer
  const [newState, coreEffect] = coreReducer(state, action, deps);

  // Add URL sync effect
  const urlEffect = urlSyncEffect(newState);

  // Batch effects
  return [newState, Effect.batch(coreEffect, urlEffect)];
};
