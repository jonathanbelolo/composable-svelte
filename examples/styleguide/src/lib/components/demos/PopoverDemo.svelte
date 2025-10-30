<script lang="ts">
  import { createStore, Effect } from '@composable-svelte/core';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import { Popover } from '@composable-svelte/core/navigation-components';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  interface DemoState {
    showPopover: boolean;
    presentation: PresentationState<boolean>;
    popoverType: 'top' | 'bottom' | 'left' | 'right';
    triggerRect: DOMRect | null;
  }

  type PresentationEvent =
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };

  type DemoAction =
    | { type: 'openPopover'; popoverType: 'top' | 'bottom' | 'left' | 'right'; rect: DOMRect }
    | { type: 'closePopover' }
    | { type: 'presentation'; event: PresentationEvent };

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: {
      showPopover: false,
      presentation: { status: 'idle' },
      popoverType: 'bottom',
      triggerRect: null
    },
    reducer: (state, action) => {
      switch (action.type) {
        case 'openPopover':
          return [
            {
              ...state,
              showPopover: true,
              popoverType: action.popoverType,
              triggerRect: action.rect,
              presentation: {
                status: 'presenting' as const,
                content: true,
                duration: 200
              }
            },
            Effect.afterDelay(200, (d) => d({ type: 'presentation', event: { type: 'presentationCompleted' } }))
          ];

        case 'closePopover':
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
                duration: 150
              }
            },
            Effect.afterDelay(150, (d) => d({ type: 'presentation', event: { type: 'dismissalCompleted' } }))
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
                ...state,
                showPopover: false,
                presentation: { status: 'idle' as const },
                triggerRect: null
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

  // Create a store wrapper with dismiss() method for Popover component
  const storeWithDismiss = $derived(demoStore.state.showPopover ? {
    ...demoStore,
    state: demoStore.state,
    dispatch: demoStore.dispatch,
    dismiss: () => demoStore.dispatch({ type: 'closePopover' })
  } : null);

  const state = $derived(demoStore.state);

  // Calculate popover position based on trigger button and direction
  const popoverStyle = $derived(() => {
    if (!state.triggerRect) return '';

    const rect = state.triggerRect;
    const gap = 8; // gap between trigger and popover

    switch (state.popoverType) {
      case 'top':
        return `left: ${rect.left + rect.width / 2}px; bottom: ${window.innerHeight - rect.top + gap}px; transform: translateX(-50%);`;
      case 'bottom':
        return `left: ${rect.left + rect.width / 2}px; top: ${rect.bottom + gap}px; transform: translateX(-50%);`;
      case 'left':
        return `right: ${window.innerWidth - rect.left + gap}px; top: ${rect.top + rect.height / 2}px; transform: translateY(-50%);`;
      case 'right':
        return `left: ${rect.right + gap}px; top: ${rect.top + rect.height / 2}px; transform: translateY(-50%);`;
    }
  });

  function handleTriggerClick(
    event: MouseEvent,
    type: 'top' | 'bottom' | 'left' | 'right'
  ) {
    const button = event.currentTarget as HTMLButtonElement;
    const rect = button.getBoundingClientRect();
    demoStore.dispatch({ type: 'openPopover', popoverType: type, rect });
  }
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click the buttons to trigger popovers in different directions
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-12 p-24 rounded-lg border-2 bg-card">
      <!-- Top Button -->
      <Button
        onclick={(e) => handleTriggerClick(e, 'top')}
        class="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Show Top Popover
      </Button>

      <!-- Middle Row: Left, Center Text, Right -->
      <div class="flex items-center gap-12">
        <Button
          onclick={(e) => handleTriggerClick(e, 'left')}
          class="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Show Left Popover
        </Button>
        <div class="text-center space-y-1">
          <p class="text-lg font-medium">Popover Positioning</p>
          <p class="text-sm text-muted-foreground">
            Popover is {state.showPopover ? 'open' : 'closed'}
          </p>
        </div>
        <Button
          onclick={(e) => handleTriggerClick(e, 'right')}
          class="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Show Right Popover
        </Button>
      </div>

      <!-- Bottom Button -->
      <Button
        onclick={(e) => handleTriggerClick(e, 'bottom')}
        class="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Show Bottom Popover
      </Button>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold">Usage</h3>
    <div class="prose prose-sm dark:prose-invert">
      <p>
        The Popover component provides contextual overlays positioned relative to trigger elements.
        It's perfect for tooltips, dropdown menus, quick actions, and additional information. Key features include:
      </p>
      <ul>
        <li>Flexible positioning relative to trigger elements</li>
        <li>Click-outside to dismiss</li>
        <li>ESC key support for keyboard accessibility</li>
        <li>Focus trap to ensure keyboard navigation stays within popover</li>
        <li>Smooth enter/exit animations via presentation system</li>
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
        <div class="text-2xl">📍</div>
        <h4 class="font-semibold">Smart Positioning</h4>
        <p class="text-sm text-muted-foreground">
          Position popovers relative to trigger elements in any direction
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">💬</div>
        <h4 class="font-semibold">Contextual Content</h4>
        <p class="text-sm text-muted-foreground">
          Show additional information or actions without cluttering the interface
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⌨️</div>
        <h4 class="font-semibold">Keyboard Accessible</h4>
        <p class="text-sm text-muted-foreground">
          Focus trap and ESC key support for full keyboard control
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">✨</div>
        <h4 class="font-semibold">State-Driven Animations</h4>
        <p class="text-sm text-muted-foreground">
          Smooth animations via presentation system with Motion One
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
        <h4 class="font-semibold">Quick Actions</h4>
        <p class="text-sm text-muted-foreground">
          Show contextual actions for items in a list or table
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Tooltips</h4>
        <p class="text-sm text-muted-foreground">
          Display helpful information about UI elements
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Dropdown Menus</h4>
        <p class="text-sm text-muted-foreground">
          Show menus or option lists relative to buttons
        </p>
      </div>
    </div>
  </section>

  <!-- Best Practices -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Best Practices</h3>
    </div>

    <div class="space-y-4">
      <div class="rounded-lg border bg-card p-6">
        <h4 class="font-semibold mb-3">When to Use Popovers</h4>
        <ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
          <li>Contextual information that doesn't warrant a modal</li>
          <li>Quick actions or menus triggered by user interaction</li>
          <li>Tooltips with rich content (links, buttons, etc.)</li>
          <li>Form field help text or validation messages</li>
        </ul>
      </div>

      <div class="rounded-lg border bg-card p-6">
        <h4 class="font-semibold mb-3">When NOT to Use Popovers</h4>
        <ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
          <li>Critical information that must be acknowledged (use modal or alert)</li>
          <li>Complex forms or multi-step workflows (use sheet or modal)</li>
          <li>Content that needs to persist while user works elsewhere</li>
          <li>Very large amounts of content (use modal or separate page)</li>
        </ul>
      </div>
    </div>
  </section>
</div>

<!-- Popover Implementation -->
{#if state.showPopover}
  <Popover
    store={storeWithDismiss}
    presentation={state.presentation}
    style={popoverStyle()}
    onPresentationComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
    onDismissalComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
  >
    {#snippet children()}
      <div class="space-y-4">
        <!-- Popover Header -->
        <div class="space-y-2">
          <h3 class="text-lg font-semibold">Popover Content</h3>
          <p class="text-sm text-muted-foreground">
            This is a {state.popoverType} positioned popover. Click outside or press ESC to dismiss.
          </p>
        </div>

        <!-- Popover Actions -->
        <div class="flex justify-end gap-2">
          <Button
            size="sm"
            class="bg-primary text-primary-foreground hover:bg-primary/90"
            onclick={() => demoStore.dispatch({ type: 'closePopover' })}
          >
            Got it
          </Button>
        </div>
      </div>
    {/snippet}
  </Popover>
{/if}
