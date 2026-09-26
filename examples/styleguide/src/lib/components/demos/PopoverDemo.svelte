<script lang="ts">
  import { Effect } from '@composable-svelte/core';
  import type { Reducer } from '@composable-svelte/core';
  import { ApplicationHost, ApplicationRoot, defineApplication, ManagedIntegrationBuilder, optionalSlot, scopeTo } from '@composable-svelte/core/application';
  import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
  import { Popover } from '@composable-svelte/core/navigation-components';
  import { Button } from '@composable-svelte/core/components/ui';

  interface DemoState {
    showPopover: boolean;
    popoverContent: boolean | null;
    presentation: PresentationState<boolean>;
    popoverType: 'top' | 'bottom' | 'left' | 'right';
    triggerRect: DOMRect | null;
  }
  type PopoverContentAction = { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };
  type DemoAction =
    | { type: 'openPopover'; popoverType: 'top' | 'bottom' | 'left' | 'right'; rect: DOMRect }
    | { type: 'closePopover' }
    | { type: 'popoverContent'; action: PresentationAction<PopoverContentAction> };

  const reducer: Reducer<DemoState, DemoAction, undefined> = (state, action) => {
    if (action.type === 'popoverContent') {
      if (action.action.type === 'dismiss') {
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      }
      if (action.action.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'presented', content: state.presentation.content } }, Effect.none()];
      }
      if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
      return [{ ...state, showPopover: false, popoverContent: null, presentation: { status: 'idle' }, triggerRect: null }, Effect.none()];
    }
    switch (action.type) {
      case 'openPopover':
        if (state.presentation.status === 'presenting' || state.presentation.status === 'presented') return [state, Effect.none()];
        return [{ ...state, showPopover: true, popoverContent: true, popoverType: action.popoverType, triggerRect: action.rect, presentation: { status: 'presenting', content: true } }, Effect.none()];
      case 'closePopover':
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };
  const popoverSlot = optionalSlot<DemoState, DemoAction>()('popoverContent');
  const childReducer: Reducer<boolean, PopoverContentAction, undefined> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(popoverSlot, childReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'openPopover'
  }).build();
  const application = defineApplication(composition, {
    initialState: (): DemoState => ({ showPopover: false, popoverContent: null, presentation: { status: 'idle' }, popoverType: 'bottom', triggerRect: null })
  });


  function getPopoverStyle(state: DemoState) {
    if (!state.triggerRect) return '';
    const rect = state.triggerRect;
    const gap = 8;
    switch (state.popoverType) {
      case 'top': return `left: ${rect.left + rect.width / 2}px; bottom: ${window.innerHeight - rect.top + gap}px; transform: translateX(-50%);`;
      case 'bottom': return `left: ${rect.left + rect.width / 2}px; top: ${rect.bottom + gap}px; transform: translateX(-50%);`;
      case 'left': return `right: ${window.innerWidth - rect.left + gap}px; top: ${rect.top + rect.height / 2}px; transform: translateY(-50%);`;
      case 'right': return `left: ${rect.right + gap}px; top: ${rect.top + rect.height / 2}px; transform: translateY(-50%);`;
    }
  }

  function handleTriggerClick(event: MouseEvent, type: DemoState['popoverType'], dispatch: (action: DemoAction) => void) {
    const button = event.currentTarget as HTMLButtonElement;
    dispatch({ type: 'openPopover', popoverType: type, rect: button.getBoundingClientRect() });
  }
</script>


<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
{#snippet children(app)}
<ApplicationHost {app}>
{@const demoStore = app.store}
{@const state = app.store.state}
{@const popoverView = scopeTo(app.store, popoverSlot)}
<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Interactive Demo</h2>
      <p class="text-muted-foreground text-sm">
        Click the buttons to trigger popovers in different directions
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-12 p-24 rounded-lg border-2 bg-card">
      <!-- Top Button -->
      <Button
        onclick={(e) => handleTriggerClick(e, 'top', demoStore.dispatch)}
        class="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Show Top Popover
      </Button>

      <!-- Middle Row: Left, Center Text, Right -->
      <div class="flex items-center gap-12">
        <Button
          onclick={(e) => handleTriggerClick(e, 'left', demoStore.dispatch)}
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
          onclick={(e) => handleTriggerClick(e, 'right', demoStore.dispatch)}
          class="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Show Right Popover
        </Button>
      </div>

      <!-- Bottom Button -->
      <Button
        onclick={(e) => handleTriggerClick(e, 'bottom', demoStore.dispatch)}
        class="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Show Bottom Popover
      </Button>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h2 class="text-xl font-semibold">Usage</h2>
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
      <h2 class="text-xl font-semibold mb-2">Key Features</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📍</div>
        <h3 class="font-semibold">Smart Positioning</h3>
        <p class="text-sm text-muted-foreground">
          Position popovers relative to trigger elements in any direction
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">💬</div>
        <h3 class="font-semibold">Contextual Content</h3>
        <p class="text-sm text-muted-foreground">
          Show additional information or actions without cluttering the interface
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⌨️</div>
        <h3 class="font-semibold">Keyboard Accessible</h3>
        <p class="text-sm text-muted-foreground">
          Focus trap and ESC key support for full keyboard control
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">✨</div>
        <h3 class="font-semibold">State-Driven Animations</h3>
        <p class="text-sm text-muted-foreground">
          Smooth animations via presentation system with Motion One
        </p>
      </div>
    </div>
  </section>

  <!-- Use Cases Section -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Common Use Cases</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Quick Actions</h3>
        <p class="text-sm text-muted-foreground">
          Show contextual actions for items in a list or table
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Tooltips</h3>
        <p class="text-sm text-muted-foreground">
          Display helpful information about UI elements
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Dropdown Menus</h3>
        <p class="text-sm text-muted-foreground">
          Show menus or option lists relative to buttons
        </p>
      </div>
    </div>
  </section>

  <!-- Best Practices -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Best Practices</h2>
    </div>

    <div class="space-y-4">
      <div class="rounded-lg border bg-card p-6">
        <h3 class="font-semibold mb-3">When to Use Popovers</h3>
        <ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
          <li>Contextual information that doesn't warrant a modal</li>
          <li>Quick actions or menus triggered by user interaction</li>
          <li>Tooltips with rich content (links, buttons, etc.)</li>
          <li>Form field help text or validation messages</li>
        </ul>
      </div>

      <div class="rounded-lg border bg-card p-6">
        <h3 class="font-semibold mb-3">When NOT to Use Popovers</h3>
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
    store={popoverView}
    presentation={state.presentation}
    style={getPopoverStyle(state)}
    onPresentationComplete={() =>
      popoverView?.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() =>
      popoverView?.dispatch({ type: 'dismissalCompleted' })}
  >
    {#snippet children()}
      <div class="space-y-4">
        <!-- Popover Header -->
        <div class="space-y-2">
          <h2 class="text-lg font-semibold">Popover Content</h2>
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
</ApplicationHost>
{/snippet}
</ApplicationRoot>
