<script lang="ts">
  import { Effect } from '@composable-svelte/core';
  import type { Reducer } from '@composable-svelte/core';
  import { ApplicationHost, ApplicationRoot, defineApplication, ManagedIntegrationBuilder, optionalSlot, scopeTo } from '@composable-svelte/core/application';
  import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
  import { Drawer } from '@composable-svelte/core/navigation-components';
  import { Button } from '@composable-svelte/core/components/ui';

  interface DemoState {
    showDrawer: boolean;
    drawerContent: boolean | null;
    presentation: PresentationState<boolean>;
  }
  type DrawerContentAction = { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };
  type DemoAction =
    | { type: 'openDrawer' }
    | { type: 'closeDrawer' }
    | { type: 'drawerContent'; action: PresentationAction<DrawerContentAction> };

  const reducer: Reducer<DemoState, DemoAction, undefined> = (state, action) => {
    if (action.type === 'drawerContent') {
      if (action.action.type === 'dismiss') {
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      }
      if (action.action.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'presented', content: state.presentation.content } }, Effect.none()];
      }
      if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
      return [{ ...state, showDrawer: false, drawerContent: null, presentation: { status: 'idle' } }, Effect.none()];
    }
    switch (action.type) {
      case 'openDrawer':
        if (state.presentation.status === 'presenting' || state.presentation.status === 'presented') return [state, Effect.none()];
        return [{ ...state, showDrawer: true, drawerContent: true, presentation: { status: 'presenting', content: true } }, Effect.none()];
      case 'closeDrawer':
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };
  const drawerSlot = optionalSlot<DemoState, DemoAction>()('drawerContent');
  const childReducer: Reducer<boolean, DrawerContentAction, undefined> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(drawerSlot, childReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'openDrawer'
  }).build();
  const application = defineApplication(composition, {
    initialState: (): DemoState => ({ showDrawer: false, drawerContent: null, presentation: { status: 'idle' } })
  });
</script>


<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
{#snippet children(app)}
<ApplicationHost {app}>
{@const demoStore = app.store}
{@const state = app.store.state}
{@const drawerView = scopeTo(app.store, drawerSlot)}
<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Interactive Demo</h2>
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
    <h2 class="text-xl font-semibold">Usage</h2>
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
      <h2 class="text-xl font-semibold mb-2">Key Features</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">🧭</div>
        <h3 class="font-semibold">Navigation</h3>
        <p class="text-sm text-muted-foreground">
          Perfect for application navigation and menu systems
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⬅️</div>
        <h3 class="font-semibold">Slide Direction</h3>
        <p class="text-sm text-muted-foreground">
          Configure to slide from left or right side
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📏</div>
        <h3 class="font-semibold">Flexible Width</h3>
        <p class="text-sm text-muted-foreground">
          Customize drawer width with CSS values
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
        <h3 class="font-semibold">Navigation Menu</h3>
        <p class="text-sm text-muted-foreground">
          Primary navigation with links and nested menus
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Admin Sidebar</h3>
        <p class="text-sm text-muted-foreground">
          Dashboard controls and settings access
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Content Browser</h3>
        <p class="text-sm text-muted-foreground">
          Browse files, folders, or document structure
        </p>
      </div>
    </div>
  </section>
</div>

<!-- Drawer Implementation -->
{#if state.showDrawer}
  <!--
    Interim legacy bridge: this demo keeps explicit PresentationState so the existing
    animation callbacks remain visible. The framework-owned view supplies lifetime and
    dismissal authority; it does not synthesize these presentation states.
  -->
  <Drawer
    store={drawerView}
    presentation={state.presentation}
    onPresentationComplete={() =>
      drawerView?.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() =>
      drawerView?.dispatch({ type: 'dismissalCompleted' })}
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
            <button type="button" class="block px-4 py-2 rounded-lg hover:bg-accent w-full text-left">
              Dashboard
            </button>
            <button type="button" class="block px-4 py-2 rounded-lg hover:bg-accent w-full text-left">
              Projects
            </button>
            <button type="button" class="block px-4 py-2 rounded-lg hover:bg-accent w-full text-left">
              Team
            </button>
            <button type="button" class="block px-4 py-2 rounded-lg hover:bg-accent w-full text-left">
              Settings
            </button>
          </nav>

          <div class="space-y-3 pt-4">
            <h2 class="font-semibold text-sm">Perfect For</h2>
            <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
              <li>App navigation</li>
              <li>Persistent sidebars</li>
              <li>Settings panels</li>
              <li>Content browsers</li>
            </ul>
          </div>

          <div class="space-y-3 pt-4">
            <h2 class="font-semibold text-sm">Dismissal Options</h2>
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
</ApplicationHost>
{/snippet}
</ApplicationRoot>
