<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction, Post, Comment } from './types';
  import { listURL, postURL } from './routing';

  interface Props {
    store: Store<AppState, AppAction>;
    post: Post;
  }

  let { store, post }: Props = $props();

  const state = $derived($store);
  const comments = $derived(
    state.comments.filter((c) => c.postId === post.id)
  );

  function navigateToList() {
    store.dispatch({
      type: 'navigate',
      destination: { type: 'list' }
    });
  }

  function navigateToPost() {
    store.dispatch({
      type: 'navigate',
      destination: { type: 'post', state: { postId: post.id } }
    });
  }
</script>

<div class="comments-page">
  <nav class="breadcrumb">
    <a href={listURL()} onclick={(e) => { e.preventDefault(); navigateToList(); }}>
      All Posts
    </a>
    <span class="separator">›</span>
    <a href={postURL(post.id)} onclick={(e) => { e.preventDefault(); navigateToPost(); }}>
      {post.title}
    </a>
    <span class="separator">›</span>
    <span class="current">Comments</span>
  </nav>

  <div class="comments-container">
    <header>
      <h1>Comments on "{post.title}"</h1>
      <p class="count">{comments.length} {comments.length === 1 ? 'comment' : 'comments'}</p>
    </header>

    {#if comments.length === 0}
      <div class="no-comments">
        <p>No comments yet. Be the first to comment!</p>
      </div>
    {:else}
      <div class="comments-list">
        {#each comments as comment (comment.id)}
          <article class="comment">
            <div class="comment-header">
              <span class="author">{comment.author}</span>
              <span class="date">{new Date(comment.date).toLocaleDateString()}</span>
            </div>
            <div class="comment-content">
              <p>{comment.content}</p>
            </div>
          </article>
        {/each}
      </div>
    {/if}

    <footer>
      <a
        href={postURL(post.id)}
        class="back-link"
        onclick={(e) => { e.preventDefault(); navigateToPost(); }}
      >
        ← Back to post
      </a>
    </footer>
  </div>
</div>

<style>
  .comments-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  .breadcrumb {
    margin-bottom: 2rem;
    font-size: 0.9375rem;
  }

  .breadcrumb a {
    color: #1976d2;
    text-decoration: none;
    transition: color 0.2s;
  }

  .breadcrumb a:hover {
    color: #1565c0;
  }

  .separator {
    color: #999;
    margin: 0 0.5rem;
  }

  .current {
    color: #666;
  }

  .comments-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 3rem;
  }

  header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem 0;
    color: #2c3e50;
  }

  .count {
    color: #666;
    margin: 0 0 2rem 0;
    font-size: 0.9375rem;
  }

  .no-comments {
    text-align: center;
    padding: 3rem 0;
    color: #999;
  }

  .comments-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .comment {
    border: 1px solid #e0e0e0;
    border-radius: 8px;
    padding: 1.5rem;
  }

  .comment-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .comment-header .author {
    font-weight: 600;
    color: #2c3e50;
  }

  .comment-header .date {
    font-size: 0.875rem;
    color: #888;
  }

  .comment-content p {
    margin: 0;
    line-height: 1.6;
    color: #333;
  }

  footer {
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #e0e0e0;
  }

  .back-link {
    color: #1976d2;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;
  }

  .back-link:hover {
    color: #1565c0;
  }
</style>
