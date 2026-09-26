<script lang="ts">
  import { Effect } from '@composable-svelte/core';
  import type { Effect as EffectType, Reducer } from '@composable-svelte/core';
  import { ApplicationHost, ApplicationRoot, defineApplication, ManagedIntegrationBuilder, optionalSlot, scopeTo } from '@composable-svelte/core/application';
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
  import { Sidebar } from '@composable-svelte/core/navigation-components';
  import { Button } from '@composable-svelte/core/components/ui';

  interface DemoState {
    showSidebar: boolean;
    sidebarContent: boolean | null;
    presentation: PresentationState<boolean>;
  }
  type SidebarContentAction = { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };
  type DemoAction =
    | { type: 'openSidebar' }
    | { type: 'toggleSidebar' }
    | { type: 'closeSidebar' }
    | { type: 'sidebarContent'; action: PresentationAction<SidebarContentAction> };

  const beginDismissal = (state: DemoState): [DemoState, EffectType<DemoAction>] => [
    { ...state, presentation: { status: 'dismissing', content: state.presentation.status === 'presented' ? state.presentation.content : true, duration: 200 } },
    Effect.none()
  ];
  const reducer: Reducer<DemoState, DemoAction, undefined> = (state, action) => {
    if (action.type === 'sidebarContent') {
      if (action.action.type === 'dismiss') {
        return state.presentation.status === 'presented' ? beginDismissal(state) : [state, Effect.none()];
      }
      if (action.action.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'presented', content: state.presentation.content } }, Effect.none()];
      }
      if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
      return [{ ...state, showSidebar: false, sidebarContent: null, presentation: { status: 'idle' } }, Effect.none()];
    }
    switch (action.type) {
      case 'openSidebar':
        return [{ ...state, showSidebar: true, sidebarContent: true, presentation: { status: 'presenting', content: true, duration: 300 } }, Effect.none()];
      case 'closeSidebar':
        return state.presentation.status === 'presented' ? beginDismissal(state) : [state, Effect.none()];
      case 'toggleSidebar':
        if (state.showSidebar) return state.presentation.status === 'presented' ? beginDismissal(state) : [state, Effect.none()];
        return [{ showSidebar: true, sidebarContent: true, presentation: { status: 'presenting', content: true, duration: 300 } }, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };
  const sidebarSlot = optionalSlot<DemoState, DemoAction>()('sidebarContent');
  const childReducer: Reducer<boolean, SidebarContentAction, undefined> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(sidebarSlot, childReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'openSidebar'
  }).build();
  const application = defineApplication(composition, {
    initialState: (): DemoState => ({ showSidebar: true, sidebarContent: true, presentation: { status: 'presented', content: true } })
  });

  let activeSidebarView: PresentationView<boolean, SidebarContentAction> | undefined;
  function captureView(node: HTMLElement, view: PresentationView<boolean, SidebarContentAction> | undefined) {
    activeSidebarView = view;
    return {
      update(next: PresentationView<boolean, SidebarContentAction> | undefined) {
        activeSidebarView = next;
      },
      destroy() {
        activeSidebarView = undefined;
      }
    };
  }
</script>


<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
{#snippet children(app)}
<ApplicationHost {app}>
{@const demoStore = app.store}
{@const state = app.store.state}
{@const sidebarView = scopeTo(app.store, sidebarSlot)}

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Interactive Demo</h2>
      <p class="text-muted-foreground text-sm">
        Toggle the sidebar to see it integrate with page layout
      </p>
    </div>

    <!-- Demo Container with Sidebar Layout -->
    <div class="rounded-lg border-2 bg-card overflow-hidden" use:captureView={sidebarView}>
      <div class="flex h-[500px]">
        <!-- Sidebar (inline, affects layout) -->
        <!--
          Interim legacy bridge: this demo keeps explicit PresentationState so the existing
          animation callbacks remain visible. The framework-owned view supplies lifetime and
          dismissal authority; it does not synthesize these presentation states.
        -->
        <Sidebar
          store={sidebarView}
          presentation={state.presentation}
          onPresentationComplete={() =>
            activeSidebarView?.dispatch({ type: 'presentationCompleted' })}
          onDismissalComplete={() =>
            activeSidebarView?.dispatch({ type: 'dismissalCompleted' })}
          side="left"
          width="240px"
        >
          {#snippet children()}
            <div class="p-4 space-y-4 h-full flex flex-col">
              <!-- Sidebar Header -->
              <div class="flex items-center justify-between pb-3 border-b">
                <h2 class="font-semibold">Navigation</h2>
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
                <button type="button" class="block px-3 py-2 rounded-lg hover:bg-accent w-full text-left">
                  Dashboard
                </button>
                <button type="button" class="block px-3 py-2 rounded-lg hover:bg-accent w-full text-left">
                  Projects
                </button>
                <button type="button" class="block px-3 py-2 rounded-lg hover:bg-accent w-full text-left">
                  Team
                </button>
                <button type="button" class="block px-3 py-2 rounded-lg bg-accent font-medium w-full text-left">
                  Settings
                </button>
                <button type="button" class="block px-3 py-2 rounded-lg hover:bg-accent w-full text-left">
                  Help
                </button>
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
    <h2 class="text-xl font-semibold">Usage</h2>
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
      <h2 class="text-xl font-semibold mb-2">Key Features</h2>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">📐</div>
        <h3 class="font-semibold">Layout Integration</h3>
        <p class="text-sm text-muted-foreground">
          Inline component that pushes content, not an overlay
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⚡</div>
        <h3 class="font-semibold">Smooth Animations</h3>
        <p class="text-sm text-muted-foreground">
          State-driven width animations for polished layout changes (300ms)
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">↔️</div>
        <h3 class="font-semibold">Side Positioning</h3>
        <p class="text-sm text-muted-foreground">
          Configure to appear on left or right side
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">🎯</div>
        <h3 class="font-semibold">Persistent Navigation</h3>
        <p class="text-sm text-muted-foreground">
          Perfect for always-visible navigation menus
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
        <h3 class="font-semibold">App Navigation</h3>
        <p class="text-sm text-muted-foreground">
          Main navigation for web applications
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Dashboard Layouts</h3>
        <p class="text-sm text-muted-foreground">
          Persistent sidebar for admin dashboards
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h3 class="font-semibold">Document Browser</h3>
        <p class="text-sm text-muted-foreground">
          File tree or table of contents navigation
        </p>
      </div>
    </div>
  </section>

  <!-- Comparison Section -->
  <section class="space-y-6">
    <div>
      <h2 class="text-xl font-semibold mb-2">Sidebar vs Drawer</h2>
    </div>

    <div class="rounded-lg border bg-card p-8">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div class="space-y-3">
          <h3 class="font-semibold">Sidebar (This Component)</h3>
          <ul class="text-sm text-muted-foreground space-y-2">
            <li>✓ Inline in document flow</li>
            <li>✓ State-driven width animations</li>
            <li>✓ No backdrop</li>
            <li>✓ Affects layout</li>
            <li>✓ Persistent navigation</li>
          </ul>
        </div>

        <div class="space-y-3">
          <h3 class="font-semibold">Drawer (Overlay)</h3>
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
</ApplicationHost>
{/snippet}
</ApplicationRoot>
