<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createStore } from '@composable-svelte/core';
  import { syncBrowserHistory } from '@composable-svelte/core/routing';
  import { styleguideReducer } from '../lib/stores/styleguide.reducer.js';
  import { createInitialStyleguideState } from '../lib/stores/styleguide.types.js';
  import { parseStyleguideURL, serializeStyleguideState, componentIdToAction } from '../lib/stores/styleguide.routing.js';
  import { COMPONENT_REGISTRY, COMPONENT_CATEGORIES, getComponentById } from '../lib/data/component-registry.js';
  import Header from '../lib/components/layout/Header.svelte';
  import ComponentCard from '../lib/components/showcase/ComponentCard.svelte';
  import ComponentShowcase from '../lib/components/showcase/ComponentShowcase.svelte';

  // ============================================================================
  // Store Initialization with Deep Linking
  // ============================================================================

  // Initialize state from URL (deep linking support)
  const defaultState = createInitialStyleguideState();
  const componentIdFromURL = parseStyleguideURL(window.location.pathname);
  const initialState = componentIdFromURL
    ? { ...defaultState, selectedComponent: componentIdFromURL }
    : defaultState;

  const store = createStore({
    initialState,
    reducer: styleguideReducer,
    dependencies: {}
  });

  // ============================================================================
  // Browser History Sync
  // ============================================================================

  let cleanup: (() => void) | null = null;

  onMount(() => {
    cleanup = syncBrowserHistory(store, {
      parse: parseStyleguideURL,
      serialize: serializeStyleguideState,
      destinationToAction: componentIdToAction
    });
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ============================================================================
  // Derived State
  // ============================================================================

  // Use onMount + subscribe instead of $derived to avoid infinite loops
  let state = $state(initialState);

  onMount(() => {
    const unsubscribe = store.subscribe(s => state = s);
    return unsubscribe;
  });

  const selectedComponentInfo = $derived(
    state.selectedComponent ? getComponentById(state.selectedComponent) : null
  );
</script>

<!-- Apply theme class to root div -->
<div class={state.theme}>
  <div class="min-h-screen bg-background text-foreground">
    <!-- Header -->
    <Header
      theme={state.theme}
      onThemeToggle={() => store.dispatch({ type: 'themeToggled' })}
    />

    <!-- Main Content -->
    <main class="container mx-auto px-6 py-12">
      {#if state.selectedComponent === null}
        <!-- Home View: Show all components by category -->
        <div class="space-y-16">
          <!-- Hero Section -->
          <div class="text-center space-y-4 py-8">
            <h2 class="text-4xl font-bold tracking-tight">
              Composable Svelte Components
            </h2>
            <p class="text-xl text-muted-foreground max-w-2xl mx-auto">
              A comprehensive collection of 72 production-ready components built with the Composable Architecture pattern.
            </p>
          </div>

          <!-- Component Categories -->
          {#each COMPONENT_CATEGORIES as category}
            {@const components = COMPONENT_REGISTRY.filter(c => c.category === category)}
            {#if components.length > 0}
              <section class="space-y-6">
                <div class="space-y-2">
                  <h3 class="text-2xl font-bold">{category}</h3>
                  <p class="text-muted-foreground">
                    {components.length} component{components.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {#each components as component}
                    <ComponentCard
                      {component}
                      onClick={() => store.dispatch({ type: 'componentSelected', componentId: component.id })}
                    />
                  {/each}
                </div>
              </section>
            {/if}
          {/each}
        </div>
      {:else if selectedComponentInfo}
        <!-- Component Showcase View -->
        <ComponentShowcase
          component={selectedComponentInfo}
          onBack={() => store.dispatch({ type: 'homeSelected' })}
        />
      {/if}
    </main>
  </div>
</div>
