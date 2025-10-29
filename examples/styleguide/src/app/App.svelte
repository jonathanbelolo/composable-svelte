<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { styleguideReducer } from '../lib/stores/styleguide.reducer.js';
  import { createInitialStyleguideState } from '../lib/stores/styleguide.types.js';
  import { COMPONENT_REGISTRY, COMPONENT_CATEGORIES } from '../lib/data/component-registry.js';
  import Header from '../lib/components/layout/Header.svelte';
  import ComponentCard from '../lib/components/showcase/ComponentCard.svelte';

  // ============================================================================
  // Store Initialization
  // ============================================================================

  const store = createStore({
    initialState: createInitialStyleguideState(),
    reducer: styleguideReducer,
    dependencies: {}
  });

  // ============================================================================
  // Derived State
  // ============================================================================

  const state = $derived(store.state);
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
      {:else}
        <!-- Component Detail View (TODO) -->
        <div class="space-y-8">
          <div class="flex items-center gap-4">
            <button
              onclick={() => store.dispatch({ type: 'homeSelected' })}
              class="w-10 h-10 rounded-lg hover:bg-accent flex items-center justify-center"
              aria-label="Back to home"
            >
              ←
            </button>
            <h2 class="text-3xl font-bold">
              Component: {state.selectedComponent}
            </h2>
          </div>

          <div class="p-12 border-2 rounded-lg bg-muted/20 text-center text-muted-foreground">
            Component showcase will be implemented in Phase 2
          </div>
        </div>
      {/if}
    </main>
  </div>
</div>
