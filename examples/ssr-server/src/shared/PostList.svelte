<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction } from './types';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  const state = $derived($store);

  function selectPost(postId: number) {
    store.dispatch({ type: 'selectPost', postId });
  }
</script>

<ul class="post-list">
  {#each state.posts as post (post.id)}
    <li class:active={state.selectedPostId === post.id}>
      <button onclick={() => selectPost(post.id)}>
        <h3>{post.title}</h3>
        <p class="meta">
          <span class="author">by {post.author}</span>
          <span class="date">{new Date(post.date).toLocaleDateString()}</span>
        </p>
        <div class="tags">
          {#each post.tags as tag}
            <span class="tag">{tag}</span>
          {/each}
        </div>
      </button>
    </li>
  {/each}
</ul>

{#if state.posts.length === 0}
  <p class="empty">No posts available.</p>
{/if}

<style>
  .post-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  li {
    margin-bottom: 0.75rem;
  }

  button {
    width: 100%;
    text-align: left;
    padding: 1rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
  }

  button:hover {
    border-color: #3498db;
    box-shadow: 0 2px 4px rgba(52, 152, 219, 0.1);
  }

  li.active button {
    background: #3498db;
    color: white;
    border-color: #3498db;
  }

  h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    opacity: 0.8;
    margin-bottom: 0.5rem;
  }

  li.active .meta {
    opacity: 0.9;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag {
    font-size: 0.7rem;
    padding: 0.125rem 0.5rem;
    background: #ecf0f1;
    border-radius: 12px;
  }

  li.active .tag {
    background: rgba(255, 255, 255, 0.2);
  }

  .empty {
    text-align: center;
    color: #999;
    padding: 2rem 0;
  }
</style>
