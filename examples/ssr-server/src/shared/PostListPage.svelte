<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import { createTranslator, createFormatters } from '@composable-svelte/core/i18n';
  import type { AppState, AppAction, Post } from './types';
  import { postURL } from './routing';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  const state = $derived($store);
  const t = $derived(createTranslator($store.i18n, 'common'));
  const formatters = $derived(createFormatters($store.i18n));

  function navigateToPost(postId: number) {
    store.dispatch({
      type: 'navigate',
      destination: { type: 'post', state: { postId } }
    });
  }

  // Strip HTML tags for plain text excerpt
  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
</script>

<div class="list-page">
  <h1>{t('posts.title')}</h1>
  <p class="subtitle">{t('nav.allPosts')}</p>

  <div class="posts-grid">
    {#each state.posts as post (post.id)}
      <article class="post-card">
        <a href={postURL(post.id)} onclick={(e) => { e.preventDefault(); navigateToPost(post.id); }}>
          <h2>{post.title}</h2>
          <p class="excerpt">{stripHtml(post.content).slice(0, 150)}...</p>
          <div class="meta">
            <span class="author">{t('posts.author', { author: post.author })}</span>
            <span class="date">{formatters.date(post.date)}</span>
          </div>
          <div class="tags">
            {#each post.tags as tag (tag)}
              <span class="tag">{tag}</span>
            {/each}
          </div>
        </a>
      </article>
    {/each}
  </div>
</div>

<style>
  .list-page {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  h1 {
    font-size: 2.5rem;
    margin: 0 0 0.5rem 0;
    color: #2c3e50;
  }

  .subtitle {
    font-size: 1.125rem;
    color: #666;
    margin: 0 0 2rem 0;
  }

  .posts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
  }

  .post-card {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .post-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .post-card a {
    display: block;
    padding: 1.5rem;
    text-decoration: none;
    color: inherit;
  }

  .post-card h2 {
    margin: 0 0 1rem 0;
    font-size: 1.5rem;
    color: #2c3e50;
  }

  .excerpt {
    color: #555;
    line-height: 1.6;
    margin: 0 0 1rem 0;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    font-size: 0.875rem;
    color: #888;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    background: #e3f2fd;
    color: #1976d2;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.8125rem;
    font-weight: 500;
  }
</style>
