<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { AppState, AppAction } from './types';
  import PostList from './PostList.svelte';
  import PostDetail from './PostDetail.svelte';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  // Reactive state derived from store
  const state = $derived($store);
  const selectedPost = $derived(
    state.posts.find((p) => p.id === state.selectedPostId)
  );
</script>

<!-- State-driven meta tags (computed by reducer, rendered by component) -->
<svelte:head>
  <title>{state.meta.title}</title>
  <meta name="description" content={state.meta.description} />
  {#if state.meta.ogImage}
    <meta property="og:title" content={state.meta.title} />
    <meta property="og:description" content={state.meta.description} />
    <meta property="og:image" content={state.meta.ogImage} />
  {/if}
  {#if state.meta.canonical}
    <link rel="canonical" href={state.meta.canonical} />
  {/if}
</svelte:head>

<div class="app">
  <header>
    <h1>Composable Svelte SSR Example</h1>
    <p>Server-Side Rendered Blog with Fastify</p>
  </header>

  <main>
    <div class="container">
      {#if state.error}
        <div class="error">
          <p>Error: {state.error}</p>
        </div>
      {:else if state.isLoading}
        <div class="loading">
          <p>Loading posts...</p>
        </div>
      {:else}
        <div class="content">
          <aside class="sidebar">
            <h2>Blog Posts</h2>
            <PostList {store} />
          </aside>

          <article class="main-content">
            {#if selectedPost}
              <PostDetail post={selectedPost} />
            {:else}
              <div class="welcome">
                <h2>Welcome!</h2>
                <p>Select a post from the sidebar to read.</p>
              </div>
            {/if}
          </article>
        </div>
      {/if}
    </div>
  </main>

  <footer>
    <p>Rendered with Composable Svelte SSR</p>
  </footer>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    background: #2c3e50;
    color: white;
    padding: 2rem;
    text-align: center;
  }

  header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
  }

  header p {
    margin: 0;
    opacity: 0.9;
  }

  main {
    flex: 1;
    padding: 2rem;
  }

  .container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .content {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: 2rem;
  }

  .sidebar {
    background: #f8f9fa;
    padding: 1.5rem;
    border-radius: 8px;
  }

  .sidebar h2 {
    margin-top: 0;
    font-size: 1.25rem;
  }

  .main-content {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .welcome {
    text-align: center;
    color: #666;
  }

  .error {
    background: #fee;
    border: 1px solid #fcc;
    color: #c00;
    padding: 1rem;
    border-radius: 4px;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  footer {
    background: #f8f9fa;
    padding: 1rem;
    text-align: center;
    color: #666;
    font-size: 0.875rem;
  }

  @media (max-width: 768px) {
    .content {
      grid-template-columns: 1fr;
    }
  }
</style>
