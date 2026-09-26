/** Pure business decisions shared by SSR and hydration. */
import { Effect } from '@composable-svelte/core';
import type { Reducer } from '@composable-svelte/core';
import { createURLSyncEffect } from '@composable-svelte/core/routing';
import { i18nReducer, type I18nAction, type I18nDependencies } from '@composable-svelte/core/i18n';
import type { AppState, AppAction, Post, Comment } from './types';
import { destinationURL, formatLocalizedURL } from './routing';
import { computeMeta } from './meta';

export interface AppDependencies extends I18nDependencies {
  fetchPosts: () => Promise<Post[]>;
  fetchComments?: (postId: number) => Promise<Comment[]>;
}

// Core owns the browser resource. The reducer supplies only route decisions.
const urlSyncEffect = createURLSyncEffect<AppState, AppAction>(
  state => formatLocalizedURL(destinationURL(state.destination), state.i18n.currentLocale),
  { serializeQuery: (state: unknown) =>
    typeof state === 'object' && state !== null && 'routeSearch' in state && typeof state.routeSearch === 'string'
      ? state.routeSearch.replace(/^\?/, '') : '' }
);
function isI18nAction(action: AppAction): action is I18nAction {
  return action.type.startsWith('i18n/');
}

const decisions: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  switch (action.type) {
    case 'postsLoaded':
      return [{ ...state, posts: action.posts, isLoading: false, error: null }, Effect.none()];
    case 'commentsLoaded':
      return [{ ...state, comments: [
        ...state.comments.filter(comment => comment.postId !== action.postId),
        ...action.comments.filter(comment => comment.postId === action.postId)
      ] }, Effect.none()];
    case 'navigate': {
      const next = { ...state, destination: action.destination };
      if (action.destination.type === 'comments' && deps.fetchComments &&
          !state.comments.some(comment => comment.postId === action.destination.state.postId)) {
        const postId = action.destination.state.postId;
        const fetchComments = deps.fetchComments;
        return [next, Effect.run(async dispatch => {
          const comments = await fetchComments(postId);
          dispatch({ type: 'commentsLoaded', postId, comments });
        })];
      }
      return [next, Effect.none()];
    }
    case 'historyNavigated': {
      const [i18n, effect] = action.locale === state.i18n.currentLocale
        ? [state.i18n, Effect.none<I18nAction>()] as const
        : i18nReducer(state.i18n, { type: 'i18n/setLocale', locale: action.locale, preloadNamespaces: ['common'] }, deps);
      return [{ ...state, destination: action.destination, routeSearch: action.search, i18n }, effect];
    }
    case 'loadPostsFailed':
      return [{ ...state, isLoading: false, error: action.error }, Effect.none()];
    case 'refreshPosts':
      return [{ ...state, isLoading: true, error: null }, Effect.run(async dispatch => {
        try { dispatch({ type: 'postsLoaded', posts: await deps.fetchPosts() }); }
        catch (error) { dispatch({ type: 'loadPostsFailed', error: error instanceof Error ? error.message : 'Failed to load posts' }); }
      })];
    default:
      if (isI18nAction(action)) {
        const [i18n, effect] = i18nReducer(state.i18n, action, deps);
        return [{ ...state, i18n }, effect];
      }
      return [state, Effect.none()];
  }
};

export const appReducer: Reducer<AppState, AppAction, AppDependencies> = (state, action, deps) => {
  const [next, effect] = decisions(state, action, deps);
  const withMeta = { ...next, meta: computeMeta(next.destination, next.posts, next.comments, next.i18n.currentLocale) };
  // Traversal and data updates must not manufacture another history entry.
  const navigation = action.type === 'navigate' && destinationURL(state.destination) !== destinationURL(next.destination)
    ? urlSyncEffect(withMeta) : Effect.none<AppAction>();
  return [withMeta, Effect.batch(effect, navigation)];
};
