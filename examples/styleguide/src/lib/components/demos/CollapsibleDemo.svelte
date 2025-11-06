<script lang="ts">
  import { Collapsible, CollapsibleTrigger, CollapsibleContent, createInitialCollapsibleState, collapsibleReducer } from '@composable-svelte/core/components/ui/collapsible/index.js';
  import { createStore } from '@composable-svelte/core';
  import { Badge } from '@composable-svelte/core/components/ui/badge/index.js';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  // Create stores for different collapsible examples
  const basicStore = createStore({
    initialState: createInitialCollapsibleState(false, false),
    reducer: collapsibleReducer,
    dependencies: {}
  });

  const detailsStore = createStore({
    initialState: createInitialCollapsibleState(true, false),
    reducer: collapsibleReducer,
    dependencies: {}
  });

  const codeStore = createStore({
    initialState: createInitialCollapsibleState(false, false),
    reducer: collapsibleReducer,
    dependencies: {}
  });

  const disabledStore = createStore({
    initialState: createInitialCollapsibleState(false, true),
    reducer: collapsibleReducer,
    dependencies: {}
  });

  const nestedStore1 = createStore({
    initialState: createInitialCollapsibleState(false, false),
    reducer: collapsibleReducer,
    dependencies: {}
  });

  const nestedStore2 = createStore({
    initialState: createInitialCollapsibleState(false, false),
    reducer: collapsibleReducer,
    dependencies: {}
  });

  const nestedStore3 = createStore({
    initialState: createInitialCollapsibleState(false, false),
    reducer: collapsibleReducer,
    dependencies: {}
  });
</script>

<div class="space-y-12">
  <!-- Basic Collapsible Demo -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Basic Collapsible</h3>
      <p class="text-muted-foreground text-sm">
        Single expandable section with smooth animations
      </p>
    </div>

    <div class="max-w-2xl border rounded-lg p-4">
      <Collapsible store={basicStore}>
        <CollapsibleTrigger>
          <span class="font-medium">What is a Collapsible component?</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p class="text-muted-foreground">
            A Collapsible is a single expandable section that can show or hide content.
            Unlike an Accordion which manages multiple items, Collapsible is a standalone
            component perfect for "show more/less" patterns, expandable details, or revealing additional options.
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </section>

  <!-- Expanded by Default -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Expanded by Default</h3>
      <p class="text-muted-foreground text-sm">
        Collapsible can start in an expanded state
      </p>
    </div>

    <div class="max-w-2xl border rounded-lg p-4">
      <Collapsible store={detailsStore}>
        <CollapsibleTrigger>
          <div class="flex items-center gap-2">
            <span class="font-medium">Product Details</span>
            <Badge variant="primary">Featured</Badge>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div class="space-y-3 mt-2">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Model:</span>
              <span class="font-medium">Premium Edition</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">SKU:</span>
              <span class="font-medium">PRD-2024-001</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Availability:</span>
              <Badge variant="success">In Stock</Badge>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">Shipping:</span>
              <span class="font-medium">Free on orders over $50</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </section>

  <!-- Code Example -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Code Example Pattern</h3>
      <p class="text-muted-foreground text-sm">
        Common use case for showing/hiding code snippets
      </p>
    </div>

    <div class="max-w-2xl border rounded-lg p-4">
      <Collapsible store={codeStore}>
        <CollapsibleTrigger>
          <div class="flex items-center gap-2">
            <span class="text-lg">💻</span>
            <span class="font-medium">View Code Example</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre class="bg-muted p-4 rounded-lg text-xs overflow-x-auto mt-2"><code>{`import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@composable-svelte/core';

const store = createStore({
  initialState: createInitialCollapsibleState(false),
  reducer: collapsibleReducer
});

<Collapsible {store}>
  <CollapsibleTrigger>Click to expand</CollapsibleTrigger>
  <CollapsibleContent>
    Your content here
  </CollapsibleContent>
</Collapsible>`}</code></pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </section>

  <!-- Disabled State -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Disabled State</h3>
      <p class="text-muted-foreground text-sm">
        Collapsible can be disabled to prevent interaction
      </p>
    </div>

    <div class="max-w-2xl space-y-4">
      <div class="border rounded-lg p-4">
        <Collapsible store={disabledStore}>
          <CollapsibleTrigger>
            <span class="font-medium">Premium Features (Requires Upgrade)</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <p class="text-muted-foreground">
              This content is only available to premium users.
            </p>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div class="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onclick={() => disabledStore.dispatch({ type: 'disabledChanged', disabled: false })}
        >
          Enable
        </Button>
        <Button
          variant="outline"
          size="sm"
          onclick={() => disabledStore.dispatch({ type: 'disabledChanged', disabled: true })}
        >
          Disable
        </Button>
      </div>
    </div>
  </section>

  <!-- Nested Collapsibles -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Nested Collapsibles</h3>
      <p class="text-muted-foreground text-sm">
        Collapsibles can be nested for hierarchical content
      </p>
    </div>

    <div class="max-w-2xl border rounded-lg p-4">
      <Collapsible store={nestedStore1}>
        <CollapsibleTrigger>
          <div class="flex items-center gap-2">
            <span class="text-lg">📁</span>
            <span class="font-medium">Project Files</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div class="ml-6 mt-2 space-y-2">
            <div class="border rounded-lg p-3">
              <Collapsible store={nestedStore2}>
                <CollapsibleTrigger>
                  <div class="flex items-center gap-2">
                    <span class="text-base">📁</span>
                    <span class="font-medium text-sm">src/</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div class="ml-6 mt-2 space-y-1 text-sm text-muted-foreground">
                    <div class="flex items-center gap-2">
                      <span>📄</span>
                      <span>index.ts</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span>📄</span>
                      <span>App.svelte</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span>📄</span>
                      <span>main.ts</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            <div class="border rounded-lg p-3">
              <Collapsible store={nestedStore3}>
                <CollapsibleTrigger>
                  <div class="flex items-center gap-2">
                    <span class="text-base">📁</span>
                    <span class="font-medium text-sm">public/</span>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div class="ml-6 mt-2 space-y-1 text-sm text-muted-foreground">
                    <div class="flex items-center gap-2">
                      <span>🖼️</span>
                      <span>logo.svg</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <span>📄</span>
                      <span>favicon.ico</span>
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  </section>

  <!-- Show More/Less Pattern -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Show More/Less Pattern</h3>
      <p class="text-muted-foreground text-sm">
        Common pattern for long content
      </p>
    </div>

    <div class="max-w-2xl">
      {#each [
        { id: 1, title: 'Understanding Reducers', preview: 'Reducers are pure functions that take state and actions...', store: createStore({ initialState: createInitialCollapsibleState(false), reducer: collapsibleReducer, dependencies: {} }) },
        { id: 2, title: 'Effect System', preview: 'Effects represent side effects in a declarative way...', store: createStore({ initialState: createInitialCollapsibleState(false), reducer: collapsibleReducer, dependencies: {} }) },
        { id: 3, title: 'Testing Best Practices', preview: 'Use TestStore for exhaustive action testing...', store: createStore({ initialState: createInitialCollapsibleState(false), reducer: collapsibleReducer, dependencies: {} }) }
      ] as item}
        <div class="border-b last:border-b-0 py-4">
          <h4 class="font-semibold mb-2">{item.title}</h4>
          <p class="text-sm text-muted-foreground mb-2">
            {item.preview}
          </p>

          <Collapsible store={item.store}>
            <CollapsibleContent>
              <p class="text-sm text-muted-foreground mb-3">
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              </p>
            </CollapsibleContent>
            <CollapsibleTrigger class="text-primary text-sm">
              {item.store.state.isExpanded ? 'Show less' : 'Show more'}
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      {/each}
    </div>
  </section>
</div>
