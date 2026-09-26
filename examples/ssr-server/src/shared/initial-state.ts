import { createInitialI18nState } from '@composable-svelte/core/i18n';
import type { I18nState } from '@composable-svelte/core/i18n';
import type { AppState, Post, Comment } from './types';
import { parseDestinationFromURL, extractLocaleAndCleanPath, SUPPORTED_LOCALES } from './routing';
import { computeMeta } from './meta';

export { SUPPORTED_LOCALES } from './routing';

export interface CreateInitialStateOptions {
  path: string;
  locale?: string;
  posts?: Post[];
  comments?: Comment[];
  translations?: I18nState['translations'];
}

export function createInitialAppState(options: CreateInitialStateOptions): AppState {
  const locale = options.locale ?? extractLocaleAndCleanPath(options.path).locale ?? 'en';
  let destination = parseDestinationFromURL(options.path);
  const posts = options.posts ?? [];
  const comments = options.comments ?? [];
  if ((destination.type === 'post' || destination.type === 'comments') && !posts.some(post => post.id === destination.state.postId)) {
    destination = { type: 'notFound', state: {} };
  }

  const baseI18n = createInitialI18nState(locale, [...SUPPORTED_LOCALES], 'en');
  const i18n: I18nState = {
    ...baseI18n,
    translations: options.translations ?? {}
  };

  const meta = computeMeta(
    destination,
    posts,
    comments,
    locale
  );

  return {
    posts,
    comments,
    destination,
    routeSearch: extractLocaleAndCleanPath(options.path).search,
    isLoading: false,
    error: null,
    meta,
    i18n
  };
}
