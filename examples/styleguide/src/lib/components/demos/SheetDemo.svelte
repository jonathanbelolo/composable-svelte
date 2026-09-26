<script lang="ts">
  import { Effect } from '@composable-svelte/core';
  import type { Reducer } from '@composable-svelte/core';
  import { ApplicationHost, ApplicationRoot, defineApplication, ManagedIntegrationBuilder, optionalSlot, scopeTo } from '@composable-svelte/core/application';
  import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
  import { Sheet } from '@composable-svelte/core/navigation-components';
  import { Button } from '@composable-svelte/core/components/ui';

  interface DemoState {
    showSheet: boolean;
    sheetContent: boolean | null;
    presentation: PresentationState<boolean>;
  }
  type SheetContentAction = { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };
  type DemoAction =
    | { type: 'openSheet' }
    | { type: 'closeSheet' }
    | { type: 'sheetContent'; action: PresentationAction<SheetContentAction> };

  const reducer: Reducer<DemoState, DemoAction, undefined> = (state, action) => {
    if (action.type === 'sheetContent') {
      if (action.action.type === 'dismiss') {
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      }
      if (action.action.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'presented', content: state.presentation.content } }, Effect.none()];
      }
      if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
      return [{ ...state, showSheet: false, sheetContent: null, presentation: { status: 'idle' } }, Effect.none()];
    }
    switch (action.type) {
      case 'openSheet':
        if (state.presentation.status === 'presenting' || state.presentation.status === 'presented') return [state, Effect.none()];
        return [{ ...state, showSheet: true, sheetContent: true, presentation: { status: 'presenting', content: true } }, Effect.none()];
      case 'closeSheet':
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };
  const sheetSlot = optionalSlot<DemoState, DemoAction>()('sheetContent');
  const childReducer: Reducer<boolean, SheetContentAction, undefined> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(sheetSlot, childReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'openSheet'
  }).build();
  const application = defineApplication(composition, {
    initialState: (): DemoState => ({ showSheet: false, sheetContent: null, presentation: { status: 'idle' } })
  });
</script>


<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
{#snippet children(app)}
<ApplicationHost {app}>
{@const demoStore = app.store}
{@const state = app.store.state}
{@const sheetView = scopeTo(app.store, sheetSlot)}

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Interactive Demo</h2>
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
    <h2 class="text-xl font-semibold">Usage</h2>
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
      <h2 class="text-xl font-semibold mb-2">Key Features</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📱</div>
        <h3 class="font-semibold">Mobile-First</h3>
        <p class="text-sm text-muted-foreground">
          Optimized for touch interactions and mobile screens
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⬆️</div>
        <h3 class="font-semibold">Slide Direction</h3>
        <p class="text-sm text-muted-foreground">
          Configure to slide from bottom, left, or right
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📏</div>
        <h3 class="font-semibold">Flexible Height</h3>
        <p class="text-sm text-muted-foreground">
          Customize sheet height with CSS values
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">✨</div>
        <h3 class="font-semibold">Smooth Animations</h3>
        <p class="text-sm text-muted-foreground">
          Slide-in and slide-out with smooth transitions
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
        <h3 class="font-semibold">Filters & Sorting</h3>
        <p class="text-sm text-muted-foreground">
          Show filtering options without leaving the current page
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Quick Settings</h3>
        <p class="text-sm text-muted-foreground">
          Access settings panel without full navigation
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Action Menus</h3>
        <p class="text-sm text-muted-foreground">
          Display contextual actions in a bottom sheet
        </p>
      </div>
    </div>
  </section>
</div>

<!-- Sheet Implementation -->
{#if state.showSheet}
  <!--
    Interim legacy bridge: this demo keeps explicit PresentationState so the existing
    animation callbacks remain visible. The framework-owned view supplies lifetime and
    dismissal authority; it does not synthesize these presentation states.
  -->
  <Sheet
    store={sheetView}
    presentation={state.presentation}
    onPresentationComplete={() =>
      sheetView?.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() =>
      sheetView?.dispatch({ type: 'dismissalCompleted' })}
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
            <h2 class="font-semibold">Example Content</h2>
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
            <h2 class="font-semibold">Dismissal Options</h2>
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
</ApplicationHost>
{/snippet}
</ApplicationRoot>
