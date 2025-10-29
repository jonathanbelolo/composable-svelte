<script lang="ts">
  import { createStore, Effect } from '@composable-svelte/core';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import { Sidebar } from '@composable-svelte/core/navigation-components';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  interface DemoState {
    showSidebar: boolean;
    presentation: PresentationState<boolean>;
  }

  type PresentationEvent =
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };

  type DemoAction =
    | { type: 'openSidebar' }
    | { type: 'closeSidebar' }
    | { type: 'toggleSidebar' }
    | { type: 'presentation'; event: PresentationEvent };

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: {
      showSidebar: true,  // Start open to show the layout
      presentation: {
        status: 'presented' as const,
        content: true
      }
    },
    reducer: (state, action) => {
      switch (action.type) {
        case 'openSidebar':
          return [
            {
              showSidebar: true,
              presentation: {
                status: 'presenting' as const,
                content: true,
                duration: 300
              }
            },
            Effect.afterDelay(300, (d) => d({ type: 'presentation', event: { type: 'presentationCompleted' } }))
          ];

        case 'closeSidebar':
          // Only allow dismissal if we're in presented state
          if (state.presentation.status !== 'presented') {
            return [state, Effect.none()];
          }
          return [
            {
              ...state,
              presentation: {
                status: 'dismissing' as const,
                content: state.presentation.content,
                duration: 200
              }
            },
            Effect.afterDelay(200, (d) => d({ type: 'presentation', event: { type: 'dismissalCompleted' } }))
          ];

        case 'toggleSidebar':
          if (state.showSidebar) {
            // Close if open - check presentation status
            if (state.presentation.status !== 'presented') {
              return [state, Effect.none()];
            }
            return [
              {
                ...state,
                presentation: {
                  status: 'dismissing' as const,
                  content: state.presentation.content,
                  duration: 200
                }
              },
              Effect.afterDelay(200, (d) => d({ type: 'presentation', event: { type: 'dismissalCompleted' } }))
            ];
          } else {
            // Open if closed
            return [
              {
                showSidebar: true,
                presentation: {
                  status: 'presenting' as const,
                  content: true,
                  duration: 300
                }
              },
              Effect.afterDelay(300, (d) => d({ type: 'presentation', event: { type: 'presentationCompleted' } }))
            ];
          }

        case 'presentation':
          if (action.event.type === 'presentationCompleted') {
            return [
              {
                ...state,
                presentation: {
                  status: 'presented' as const,
                  content: state.presentation.status === 'presenting' ? state.presentation.content : true
                }
              },
              Effect.none()
            ];
          }
          if (action.event.type === 'dismissalCompleted') {
            return [
              {
                showSidebar: false,
                presentation: { status: 'idle' as const }
              },
              Effect.none()
            ];
          }
          return [state, Effect.none()];

        default:
          return [state, Effect.none()];
      }
    },
    dependencies: {}
  });

  // Create a store wrapper with dismiss() method for Sidebar component
  const storeWithDismiss = $derived(
    demoStore.state.showSidebar
      ? {
          ...demoStore,
          state: demoStore.state,
          dispatch: demoStore.dispatch,
          dismiss: () => demoStore.dispatch({ type: 'closeSidebar' })
        }
      : null
  );

  const state = $derived(demoStore.state);
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Toggle the sidebar to see it integrate with page layout
      </p>
    </div>

    <!-- Demo Container with Sidebar Layout -->
    <div class="rounded-lg border-2 bg-card overflow-hidden">
      <div class="flex h-[500px]">
        <!-- Sidebar (inline, affects layout) -->
        <Sidebar
          store={storeWithDismiss}
          presentation={state.presentation}
          onPresentationComplete={() =>
            demoStore.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
          onDismissalComplete={() =>
            demoStore.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
          side="left"
          width="240px"
        >
          {#snippet children()}
            <div class="p-4 space-y-4 h-full flex flex-col">
              <!-- Sidebar Header -->
              <div class="flex items-center justify-between pb-3 border-b">
                <h3 class="font-semibold">Navigation</h3>
                <button
                  onclick={() => demoStore.dispatch({ type: 'closeSidebar' })}
                  class="w-6 h-6 rounded hover:bg-accent flex items-center justify-center text-xs"
                  aria-label="Close sidebar"
                >
                  ✕
                </button>
              </div>

              <!-- Navigation Links -->
              <nav class="flex-1 space-y-1">
                <a href="#" class="block px-3 py-2 rounded-lg hover:bg-accent transition-colors">
                  Dashboard
                </a>
                <a href="#" class="block px-3 py-2 rounded-lg hover:bg-accent transition-colors">
                  Projects
                </a>
                <a href="#" class="block px-3 py-2 rounded-lg hover:bg-accent transition-colors">
                  Team
                </a>
                <a href="#" class="block px-3 py-2 rounded-lg bg-accent font-medium transition-colors">
                  Settings
                </a>
                <a href="#" class="block px-3 py-2 rounded-lg hover:bg-accent transition-colors">
                  Help
                </a>
              </nav>

              <!-- Sidebar Footer -->
              <div class="pt-3 border-t text-xs text-muted-foreground">
                <p>Press ESC to close</p>
              </div>
            </div>
          {/snippet}
        </Sidebar>

        <!-- Main Content Area -->
        <div class="flex-1 p-6 space-y-4 overflow-auto">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-lg font-semibold">Main Content</h2>
            <Button onclick={() => demoStore.dispatch({ type: 'toggleSidebar' })}>
              {state.showSidebar ? 'Hide' : 'Show'} Sidebar
            </Button>
          </div>

          <div class="space-y-4">
            <p class="text-sm text-muted-foreground">
              The sidebar is integrated inline with the page layout. When shown,
              it pushes the main content to the right. When hidden, the content
              expands to fill the space.
            </p>

            <div class="p-4 bg-muted/20 rounded-lg">
              <p class="text-sm font-medium mb-2">Key Differences</p>
              <ul class="text-sm text-muted-foreground space-y-1">
                <li>• Inline component (not an overlay)</li>
                <li>• State-driven width animations (300ms)</li>
                <li>• Affects page layout</li>
                <li>• No backdrop</li>
                <li>• ESC key closes it</li>
              </ul>
            </div>

            <div class="space-y-2">
              <div class="h-8 bg-muted/20 rounded"></div>
              <div class="h-8 bg-muted/20 rounded"></div>
              <div class="h-8 bg-muted/20 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold">Usage</h3>
    <div class="prose prose-sm dark:prose-invert">
      <p>
        The Sidebar component provides an inline navigation panel that integrates
        with your page layout. Unlike Modal/Sheet/Drawer which are overlays, the
        Sidebar is part of the document flow and affects the layout of surrounding
        content. Features include:
      </p>
      <ul>
        <li>Inline layout integration (not fixed/absolute)</li>
        <li>State-driven width animations for smooth transitions</li>
        <li>Positioned left or right</li>
        <li>Customizable width</li>
        <li>ESC key support for closing</li>
        <li>Persistent navigation pattern</li>
      </ul>
    </div>
  </section>

  <!-- Features Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Key Features</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📐</div>
        <h4 class="font-semibold">Layout Integration</h4>
        <p class="text-sm text-muted-foreground">
          Inline component that pushes content, not an overlay
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⚡</div>
        <h4 class="font-semibold">Smooth Animations</h4>
        <p class="text-sm text-muted-foreground">
          State-driven width animations for polished layout changes (300ms)
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">↔️</div>
        <h4 class="font-semibold">Side Positioning</h4>
        <p class="text-sm text-muted-foreground">
          Configure to appear on left or right side
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">🎯</div>
        <h4 class="font-semibold">Persistent Navigation</h4>
        <p class="text-sm text-muted-foreground">
          Perfect for always-visible navigation menus
        </p>
      </div>
    </div>
  </section>

  <!-- Use Cases Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">App Navigation</h4>
        <p class="text-sm text-muted-foreground">
          Main navigation for web applications
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Dashboard Layouts</h4>
        <p class="text-sm text-muted-foreground">
          Persistent sidebar for admin dashboards
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Document Browser</h4>
        <p class="text-sm text-muted-foreground">
          File tree or table of contents navigation
        </p>
      </div>
    </div>
  </section>

  <!-- Comparison Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Sidebar vs Drawer</h3>
    </div>

    <div class="rounded-lg border bg-card p-8">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-3">
          <h4 class="font-semibold">Sidebar (This Component)</h4>
          <ul class="text-sm text-muted-foreground space-y-2">
            <li>✓ Inline in document flow</li>
            <li>✓ State-driven width animations</li>
            <li>✓ No backdrop</li>
            <li>✓ Affects layout</li>
            <li>✓ Persistent navigation</li>
          </ul>
        </div>

        <div class="space-y-3">
          <h4 class="font-semibold">Drawer (Overlay)</h4>
          <ul class="text-sm text-muted-foreground space-y-2">
            <li>✓ Fixed/absolute positioning</li>
            <li>✓ Animated slide-in</li>
            <li>✓ Has backdrop overlay</li>
            <li>✓ Doesn't affect layout</li>
            <li>✓ Temporary navigation</li>
          </ul>
        </div>
      </div>
    </div>
  </section>
</div>
