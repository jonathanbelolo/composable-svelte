<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import { createTranslator, createFormatters } from '@composable-svelte/core/i18n';
  import type { AppState, AppAction, Post } from './types';
  import { listURL, commentsURL } from './routing';

  interface Props {
    store: Store<AppState, AppAction>;
    post: Post;
  }

  let { store, post }: Props = $props();

  const state = $derived($store);
  const t = $derived(createTranslator($store.i18n, 'common'));
  const formatters = $derived(createFormatters($store.i18n));
  const commentCount = $derived(
    state.comments.filter((c) => c.postId === post.id).length
  );

  function navigateToList() {
    store.dispatch({
      type: 'navigate',
      destination: { type: 'list' }
    });
  }

  function navigateToComments() {
    store.dispatch({
      type: 'navigate',
      destination: { type: 'comments', state: { postId: post.id } }
    });
  }
</script>

<div class="detail-page">
  <nav class="breadcrumb">
    <a href={listURL()} onclick={(e) => { e.preventDefault(); navigateToList(); }}>
      {t('posts.backToList')}
    </a>
  </nav>

  <article class="post-detail">
    <header>
      <h1>{post.title}</h1>
      <div class="meta">
        <span class="author">{t('posts.author', { author: post.author })}</span>
        <span class="date">{formatters.date(post.date)}</span>
      </div>
      <div class="tags">
        {#each post.tags as tag (tag)}
          <span class="tag">{tag}</span>
        {/each}
      </div>
    </header>

    <div class="content">
      {@html post.content}
    </div>

    <footer>
      <a
        href={commentsURL(post.id)}
        class="comments-link"
        onclick={(e) => { e.preventDefault(); navigateToComments(); }}
      >
        {t('posts.viewComments', { count: commentCount })}
      </a>
    </footer>
  </article>
</div>

<style>
  .detail-page {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
  }

  .breadcrumb {
    margin-bottom: 2rem;
  }

  .breadcrumb a {
    color: #1976d2;
    text-decoration: none;
    font-weight: 500;
    transition: color 0.2s;
  }

  .breadcrumb a:hover {
    color: #1565c0;
  }

  .post-detail {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    padding: 3rem;
  }

  header h1 {
    font-size: 2.5rem;
    margin: 0 0 1rem 0;
    color: #2c3e50;
    line-height: 1.2;
  }

  .meta {
    display: flex;
    gap: 2rem;
    margin-bottom: 1rem;
    font-size: 0.9375rem;
    color: #666;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 2rem;
  }

  .tag {
    background: #e3f2fd;
    color: #1976d2;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8125rem;
    font-weight: 500;
  }

  .content {
    border-top: 1px solid #e0e0e0;
    padding-top: 2rem;
    margin-bottom: 2rem;
    font-size: 1.125rem;
    line-height: 1.8;
    color: #333;
  }

  .content :global(p) {
    margin: 1rem 0;
  }

  .content :global(ul) {
    margin: 1rem 0;
    padding-left: 1.5rem;
  }

  .content :global(strong) {
    font-weight: 600;
  }

  .content :global(em) {
    font-style: italic;
  }

  footer {
    border-top: 1px solid #e0e0e0;
    padding-top: 2rem;
  }

  .comments-link {
    display: inline-block;
    background: #1976d2;
    color: white;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    transition: background 0.2s;
  }

  .comments-link:hover {
    background: #1565c0;
  }
</style>
