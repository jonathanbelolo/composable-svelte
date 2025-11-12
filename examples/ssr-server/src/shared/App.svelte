<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import { createTranslator } from '@composable-svelte/core/i18n';
  import type { AppState, AppAction } from './types';
  import PostListPage from './PostListPage.svelte';
  import PostDetailPage from './PostDetailPage.svelte';
  import PostCommentsPage from './PostCommentsPage.svelte';
  import LanguageSwitcher from './LanguageSwitcher.svelte';

  interface Props {
    store: Store<AppState, AppAction>;
  }

  let { store }: Props = $props();

  // Reactive state derived from store
  const state = $derived($store);

  // Create translation function
  const t = $derived(createTranslator($store.i18n, 'common'));

  // Derive current post (for detail and comments pages)
  const currentPost = $derived(
    state.destination.type === 'post' || state.destination.type === 'comments'
      ? state.posts.find((p) => p.id === state.destination.state.postId)
      : null
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
    <div class="header-content">
      <div class="header-text">
        <h1>{t('app.title')}</h1>
        <p>{t('app.description')}</p>
      </div>
      <LanguageSwitcher {store} />
    </div>
  </header>

  <main>
    {#if state.error}
      <div class="error">
        <p>{t('posts.error')}: {state.error}</p>
      </div>
    {:else if state.isLoading}
      <div class="loading">
        <p>{t('posts.loading')}</p>
      </div>
    {:else}
      <!-- Route based on destination -->
      {#if state.destination.type === 'list'}
        <PostListPage {store} />
      {:else if state.destination.type === 'post' && currentPost}
        <PostDetailPage {store} post={currentPost} />
      {:else if state.destination.type === 'comments' && currentPost}
        <PostCommentsPage {store} post={currentPost} />
      {:else}
        <div class="not-found">
          <h2>{t('posts.notFound')}</h2>
          <p>{t('posts.error')}</p>
        </div>
      {/if}
    {/if}
  </main>

  <footer>
    <p>
      Composable Svelte SSR - {t('app.description')}
    </p>
  </footer>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: #f8f9fa;
  }

  header {
    background: #2c3e50;
    color: white;
    padding: 2rem;
  }

  .header-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .header-text {
    text-align: center;
    flex: 1;
    min-width: 300px;
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
    padding: 0;
  }

  .error {
    max-width: 800px;
    margin: 2rem auto;
    background: #fee;
    border: 1px solid #fcc;
    color: #c00;
    padding: 1rem;
    border-radius: 8px;
  }

  .loading {
    text-align: center;
    padding: 4rem 2rem;
    color: #666;
  }

  .not-found {
    max-width: 800px;
    margin: 4rem auto;
    padding: 3rem;
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    color: #666;
  }

  .not-found h2 {
    color: #2c3e50;
    margin-top: 0;
  }

  footer {
    background: #2c3e50;
    padding: 1rem;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.875rem;
  }
</style>
