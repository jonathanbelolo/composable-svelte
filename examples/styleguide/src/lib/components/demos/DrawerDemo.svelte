<script lang="ts">
  import { createStore, Effect } from '@composable-svelte/core';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import { Drawer } from '@composable-svelte/core/navigation-components';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  interface DemoState {
    showDrawer: boolean;
    presentation: PresentationState<boolean>;
  }

  type PresentationEvent =
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };

  type DemoAction =
    | { type: 'openDrawer' }
    | { type: 'closeDrawer' }
    | { type: 'presentation'; event: PresentationEvent };

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: {
      showDrawer: false,
      presentation: { status: 'idle' }
    },
    reducer: (state, action) => {
      switch (action.type) {
        case 'openDrawer':
          return [
            {
              showDrawer: true,
              presentation: {
                status: 'presenting' as const,
                content: true,
                duration: 300
              }
            },
            Effect.afterDelay(300, (d) => d({ type: 'presentation', event: { type: 'presentationCompleted' } }))
          ];

        case 'closeDrawer':
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
                showDrawer: false,
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

  // Create a store wrapper with dismiss() method for Drawer component
  const storeWithDismiss = $derived({
    ...demoStore,
    state: $demoStore,
    dispatch: demoStore.dispatch,
    dismiss: () => demoStore.dispatch({ type: 'closeDrawer' })
  });

  const state = $derived($demoStore);
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click the button to open a side drawer
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <Button onclick={() => demoStore.dispatch({ type: 'openDrawer' })}>
        Open Drawer
      </Button>
      <p class="text-sm text-muted-foreground">
        Drawer is {state.showDrawer ? 'open' : 'closed'}
      </p>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold">Usage</h3>
    <div class="prose prose-sm dark:prose-invert">
      <p>
        The Drawer component provides a sliding panel that appears from the side of the screen.
        Perfect for navigation menus, persistent sidebars, or settings panels. Features include:
      </p>
      <ul>
        <li>Backdrop overlay with customizable opacity</li>
        <li>Slide-in from left or right</li>
        <li>Customizable width</li>
        <li>ESC key support for closing</li>
        <li>Click-outside-to-close functionality (optional)</li>
        <li>Smooth slide animations</li>
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
        <div class="text-2xl">🧭</div>
        <h4 class="font-semibold">Navigation</h4>
        <p class="text-sm text-muted-foreground">
          Perfect for application navigation and menu systems
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⬅️</div>
        <h4 class="font-semibold">Slide Direction</h4>
        <p class="text-sm text-muted-foreground">
          Configure to slide from left or right side
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📏</div>
        <h4 class="font-semibold">Flexible Width</h4>
        <p class="text-sm text-muted-foreground">
          Customize drawer width with CSS values
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">✨</div>
        <h4 class="font-semibold">Smooth Animations</h4>
        <p class="text-sm text-muted-foreground">
          Slide-in and slide-out with smooth transitions
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
        <h4 class="font-semibold">Navigation Menu</h4>
        <p class="text-sm text-muted-foreground">
          Primary navigation with links and nested menus
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Admin Sidebar</h4>
        <p class="text-sm text-muted-foreground">
          Dashboard controls and settings access
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Content Browser</h4>
        <p class="text-sm text-muted-foreground">
          Browse files, folders, or document structure
        </p>
      </div>
    </div>
  </section>
</div>

<!-- Drawer Implementation -->
{#if state.showDrawer}
  <Drawer
    store={storeWithDismiss}
    presentation={state.presentation}
    onPresentationComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
    onDismissalComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
    side="left"
    width="320px"
  >
    {#snippet children()}
      <div class="p-6 space-y-6 h-full flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between border-b pb-4">
          <h2 class="text-2xl font-bold">Navigation</h2>
          <button
            onclick={() => demoStore.dispatch({ type: 'closeDrawer' })}
            class="w-8 h-8 rounded-lg hover:bg-accent flex items-center justify-center"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto space-y-2">
          <p class="text-sm text-muted-foreground mb-4">
            This is a drawer panel. It slides in from the left side of the screen.
          </p>

          <!-- Navigation Items -->
          <nav class="space-y-1">
            <a href="#" class="block px-4 py-2 rounded-lg hover:bg-accent transition-colors">
              Dashboard
            </a>
            <a href="#" class="block px-4 py-2 rounded-lg hover:bg-accent transition-colors">
              Projects
            </a>
            <a href="#" class="block px-4 py-2 rounded-lg hover:bg-accent transition-colors">
              Team
            </a>
            <a href="#" class="block px-4 py-2 rounded-lg hover:bg-accent transition-colors">
              Settings
            </a>
          </nav>

          <div class="space-y-3 pt-4">
            <h3 class="font-semibold text-sm">Perfect For</h3>
            <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>App navigation</li>
              <li>Persistent sidebars</li>
              <li>Settings panels</li>
              <li>Content browsers</li>
            </ul>
          </div>

          <div class="space-y-3 pt-4">
            <h3 class="font-semibold text-sm">Dismissal Options</h3>
            <p class="text-sm text-muted-foreground">
              The drawer will close when you:
            </p>
            <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>Press the ESC key</li>
              <li>Click the backdrop (outside this drawer)</li>
              <li>Click the close button above</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div class="border-t pt-4">
          <Button
            class="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onclick={() => demoStore.dispatch({ type: 'closeDrawer' })}
          >
            Close Drawer
          </Button>
        </div>
      </div>
    {/snippet}
  </Drawer>
{/if}
