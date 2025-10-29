<script lang="ts">
  import { createStore, Effect } from '@composable-svelte/core';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import { Sheet } from '@composable-svelte/core/navigation-components';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  interface DemoState {
    showSheet: boolean;
    presentation: PresentationState<boolean>;
  }

  type PresentationEvent =
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };

  type DemoAction =
    | { type: 'openSheet' }
    | { type: 'closeSheet' }
    | { type: 'presentation'; event: PresentationEvent };

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: {
      showSheet: false,
      presentation: { status: 'idle' }
    },
    reducer: (state, action) => {
      switch (action.type) {
        case 'openSheet':
          return [
            {
              showSheet: true,
              presentation: {
                status: 'presenting' as const,
                content: true,
                duration: 300
              }
            },
            Effect.afterDelay(300, (d) => d({ type: 'presentation', event: { type: 'presentationCompleted' } }))
          ];

        case 'closeSheet':
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
                showSheet: false,
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

  // Create a store wrapper with dismiss() method for Sheet component
  const storeWithDismiss = $derived({
    ...demoStore,
    state: demoStore.state,
    dispatch: demoStore.dispatch,
    dismiss: () => demoStore.dispatch({ type: 'closeSheet' })
  });

  const state = $derived(demoStore.state);
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click the button to open a bottom sheet
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <Button onclick={() => demoStore.dispatch({ type: 'openSheet' })}>
        Open Sheet
      </Button>
      <p class="text-sm text-muted-foreground">
        Sheet is {state.showSheet ? 'open' : 'closed'}
      </p>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold">Usage</h3>
    <div class="prose prose-sm dark:prose-invert">
      <p>
        The Sheet component provides a sliding panel that appears from the bottom (or sides) of the screen.
        Perfect for mobile-friendly interactions like filters, settings, or quick actions. Features include:
      </p>
      <ul>
        <li>Backdrop overlay with customizable opacity</li>
        <li>Slide-in from bottom, left, or right</li>
        <li>Customizable height</li>
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
        <div class="text-2xl">📱</div>
        <h4 class="font-semibold">Mobile-First</h4>
        <p class="text-sm text-muted-foreground">
          Optimized for touch interactions and mobile screens
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⬆️</div>
        <h4 class="font-semibold">Slide Direction</h4>
        <p class="text-sm text-muted-foreground">
          Configure to slide from bottom, left, or right
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📏</div>
        <h4 class="font-semibold">Flexible Height</h4>
        <p class="text-sm text-muted-foreground">
          Customize sheet height with CSS values
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
        <h4 class="font-semibold">Filters & Sorting</h4>
        <p class="text-sm text-muted-foreground">
          Show filtering options without leaving the current page
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Quick Settings</h4>
        <p class="text-sm text-muted-foreground">
          Access settings panel without full navigation
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Action Menus</h4>
        <p class="text-sm text-muted-foreground">
          Display contextual actions in a bottom sheet
        </p>
      </div>
    </div>
  </section>
</div>

<!-- Sheet Implementation -->
{#if state.showSheet}
  <Sheet
    store={storeWithDismiss}
    presentation={state.presentation}
    onPresentationComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
    onDismissalComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
    height="60vh"
  >
    {#snippet children()}
      <div class="p-6 space-y-6 h-full flex flex-col">
        <!-- Header -->
        <div class="flex items-center justify-between border-b pb-4">
          <h2 class="text-2xl font-bold">Sheet Title</h2>
          <button
            onclick={() => demoStore.dispatch({ type: 'closeSheet' })}
            class="w-8 h-8 rounded-lg hover:bg-accent flex items-center justify-center"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <!-- Content -->
        <div class="flex-1 overflow-auto space-y-4">
          <p class="text-sm text-muted-foreground">
            This is a bottom sheet. It slides up from the bottom of the screen.
          </p>

          <div class="space-y-3">
            <h3 class="font-semibold">Example Content</h3>
            <p class="text-sm">
              Sheets are perfect for:
            </p>
            <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>Filter panels</li>
              <li>Settings menus</li>
              <li>Action sheets</li>
              <li>Mobile-friendly forms</li>
            </ul>
          </div>

          <div class="space-y-3">
            <h3 class="font-semibold">Dismissal Options</h3>
            <p class="text-sm text-muted-foreground">
              The sheet will close when you:
            </p>
            <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>Press the ESC key</li>
              <li>Click the backdrop (outside this sheet)</li>
              <li>Click the close button above</li>
              <li>Click the action buttons below</li>
            </ul>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="flex justify-end gap-3 border-t pt-4">
          <Button
            class="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onclick={() => demoStore.dispatch({ type: 'closeSheet' })}
          >
            Cancel
          </Button>
          <Button
            class="bg-primary text-primary-foreground hover:bg-primary/90"
            onclick={() => demoStore.dispatch({ type: 'closeSheet' })}
          >
            Apply
          </Button>
        </div>
      </div>
    {/snippet}
  </Sheet>
{/if}
