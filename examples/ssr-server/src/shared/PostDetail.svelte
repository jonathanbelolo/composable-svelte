<script lang="ts">
  import { animateFadeIn } from '@composable-svelte/core/animation';
  import type { Post } from './types';

  interface Props {
    post: Post;
  }

  let { post }: Props = $props();

  let rootElement: HTMLElement | undefined = $state();

  // A plain `let`, never `$state`: a reactive guard would re-trigger the effect
  // it lives in. `$effect` does not run during SSR, and with the keyframe gone
  // the resting opacity is 1 — so a server-rendered page with no JS shows the
  // post rather than starting it invisible, which the keyframe did.
  let hasEntered = false;

  $effect(() => {
    if (hasEntered || !rootElement) return;
    hasEntered = true;
    animateFadeIn(rootElement);
  });
</script>

<article class="post-detail" bind:this={rootElement}>
  <header>
    <h1>{post.title}</h1>
    <div class="meta">
      <span class="author">By {post.author}</span>
      <span class="separator">•</span>
      <span class="date">{new Date(post.date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}</span>
    </div>
    <div class="tags">
      {#each post.tags as tag}
        <span class="tag">{tag}</span>
      {/each}
    </div>
  </header>

  <div class="content">
    {@html post.content}
  </div>
</article>

<style>
  header {
    margin-bottom: 2rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #ecf0f1;
  }

  h1 {
    margin: 0 0 0.75rem 0;
    font-size: 2rem;
    color: #2c3e50;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #7f8c8d;
    margin-bottom: 1rem;
  }

  .separator {
    opacity: 0.5;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .tag {
    font-size: 0.75rem;
    padding: 0.25rem 0.75rem;
    background: #3498db;
    color: white;
    border-radius: 16px;
    font-weight: 500;
  }

  .content {
    line-height: 1.7;
    color: #34495e;
  }

  .content :global(p) {
    margin: 0 0 1rem 0;
  }

  .content :global(p:last-child) {
    margin-bottom: 0;
  }

  .content :global(strong) {
    color: #2c3e50;
    font-weight: 600;
  }

  .content :global(em) {
    font-style: italic;
    color: #7f8c8d;
  }
</style>
