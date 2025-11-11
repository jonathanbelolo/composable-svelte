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
 * Comment on a blog post (for nested routing example).
 */
export interface Comment {
  id: number;
  postId: number;
  author: string;
  content: string;
  date: string;
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

/**
 * Destination types for routing (demonstration of navigation spec patterns).
 *
 * - list: Show all posts (/)
 * - post: Show single post detail (/posts/:id)
 * - comments: Show post comments - nested route (/posts/:id/comments)
 */
export type AppDestination =
  | { type: 'list' }
  | { type: 'post'; state: { postId: number } }
  | { type: 'comments'; state: { postId: number } };

export interface AppState {
  posts: Post[];
  comments: Comment[];
  destination: AppDestination;
  isLoading: boolean;
  error: string | null;
  meta: PageMeta;
}

export type AppAction =
  | { type: 'postsLoaded'; posts: Post[] }
  | { type: 'commentsLoaded'; comments: Comment[] }
  | { type: 'navigate'; destination: AppDestination }
  | { type: 'loadPostsFailed'; error: string }
  | { type: 'refreshPosts' };

export const initialState: AppState = {
  posts: [],
  comments: [],
  destination: { type: 'list' },
  isLoading: false,
  error: null,
  meta: {
    title: 'Composable Svelte SSR Example',
    description: 'Server-Side Rendered blog with Composable Svelte and Fastify'
  }
};
