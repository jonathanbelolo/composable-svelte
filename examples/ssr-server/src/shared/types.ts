/**
 * Shared types for the SSR example application.
 * Used by both server and client.
 */

export interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  date: string;
  tags: string[];
}

/**
 * Page metadata for SEO and social sharing.
 * Computed by the reducer based on application state.
 */
export interface PageMeta {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
}

export interface AppState {
  posts: Post[];
  selectedPostId: number | null;
  isLoading: boolean;
  error: string | null;
  meta: PageMeta;
}

export type AppAction =
  | { type: 'postsLoaded'; posts: Post[] }
  | { type: 'selectPost'; postId: number }
  | { type: 'loadPostsFailed'; error: string }
  | { type: 'refreshPosts' };

export const initialState: AppState = {
  posts: [],
  selectedPostId: null,
  isLoading: false,
  error: null,
  meta: {
    title: 'Composable Svelte SSR Example',
    description: 'Server-Side Rendered blog with Composable Svelte and Fastify'
  }
};
