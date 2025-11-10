/**
 * Application reducer.
 * Shared between server and client.
 */

import { Effect } from '@composable-svelte/core';
import type { Reducer } from '@composable-svelte/core';
import type { AppState, AppAction } from './types';

export interface AppDependencies {
  fetchPosts: () => Promise<any[]>;
}

export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (
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

    case 'selectPost':
      return [
        {
          ...state,
          selectedPostId: action.postId
        },
        Effect.none()
      ];

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

    default:
      return [state, Effect.none()];
  }
};
