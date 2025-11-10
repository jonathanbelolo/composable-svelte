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

export interface AppState {
  posts: Post[];
  selectedPostId: number | null;
  isLoading: boolean;
  error: string | null;
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
  error: null
};
