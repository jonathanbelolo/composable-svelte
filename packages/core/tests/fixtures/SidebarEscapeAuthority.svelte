<script lang="ts">
  import { onDestroy } from 'svelte';
  import Sidebar from '../../src/lib/navigation-components/primitives/SidebarPrimitive.svelte';
  import NavigationStack from '../../src/lib/navigation-components/primitives/NavigationStackPrimitive.svelte';
  import { createStore } from '../../src/lib/store.svelte.js';
  import { Effect } from '../../src/lib/effect.js';
  import {
    ManagedIntegrationBuilder,
    optionalSlot,
    keyedSlot,
    type PresentationView,
    type ChildView
  } from '../../src/lib/navigation/managed-integration.js';
  import type { Reducer } from '../../src/lib/types.js';
  import type { PresentationAction, PresentationState } from '../../src/lib/navigation/types.js';

  let {
    requests,
    initialDisabled = false,
    initialSidebar = true,
    initialStack = false,
    initialReverse = false,
    initialHasStore = true,
    initialPresentation = undefined
  }: {
    requests: (name: string) => void;
    initialDisabled?: boolean;
    initialSidebar?: boolean;
    initialStack?: boolean;
    initialReverse?: boolean;
    initialHasStore?: boolean;
    initialPresentation?: PresentationState<string> | undefined;
  } = $props();

  let disabled = $state(initialDisabled);
  let showSidebar = $state(initialSidebar);
  let showStack = $state(initialStack);
  let hasStore = $state(initialHasStore);
  let presentation = $state<PresentationState<string> | undefined>(initialPresentation);
  let stack = $state<readonly unknown[]>([{}, {}]);

  interface SidebarState {}
  interface NavState {}
  interface RootState {
    sidebar: SidebarState | null;
    nav: Array<{ id: number; state: NavState }>;
  }
  type RootAction =
    | { type: 'sidebar'; action: PresentationAction<{ type: 'noop' }> }
    | { type: 'nav'; id: number; action: never };

  interface Dependencies {
    requests: (name: string) => void;
  }

  const sidebarSlot = optionalSlot<RootState, RootAction>()('sidebar');
  const navSlot = keyedSlot<RootState, RootAction>()('nav');

  const rootReducer: Reducer<RootState, RootAction, Dependencies> = (state, action, deps) => {
    if (action.type === 'sidebar' && action.action.type === 'dismiss') {
      // This fixture observes but rejects close requests, matching its original stable dummy store.
      return [{ ...state, sidebar: {} }, Effect.fireAndForget(() => deps.requests('sidebar'))];
    }
    return [state, Effect.none()];
  };

  const composition = new ManagedIntegrationBuilder<RootState, RootAction, Dependencies>(rootReducer)
    .with(sidebarSlot, (s) => [s, Effect.none()])
    .forEach(navSlot, (s) => [s, Effect.none()])
    .build();

  const rootStore = createStore({
    initialState: {
      sidebar: {},
      nav: [{ id: 1, state: {} }]
    },
    dependencies: {
      requests: (name: string) => requests(name)
    },
    ...composition
  });
  onDestroy(() => rootStore.destroy());

  const sidebarStore: PresentationView<SidebarState, { type: 'noop' }> | undefined = composition.bind(rootStore, sidebarSlot);
  const navStore: ChildView<NavState, never> | undefined = composition.bind(rootStore, navSlot.at(1));

  export function setDisabled(value: boolean) { disabled = value; }
  export function setHasStore(value: boolean) { hasStore = value; }
  export function setPresentation(value: PresentationState<string> | undefined) { presentation = value; }
  export function setStack(value: readonly unknown[]) { stack = value; }
  export function setShowSidebar(value: boolean) { showSidebar = value; }
  export function setShowStack(value: boolean) { showStack = value; }
</script>

{#snippet sidebarLayer()}
  {#if showSidebar}
    <Sidebar
      store={hasStore ? sidebarStore : undefined}
      disableEscapeKey={disabled}
      {presentation}
    >
      {#snippet children({ bindContent })}
        <div use:bindContent data-testid="sidebar">Sidebar</div>
      {/snippet}
    </Sidebar>
  {/if}
{/snippet}

{#snippet stackLayer()}
  {#if showStack}
    <NavigationStack
      store={navStore}
      {stack}
      onBack={() => requests('stack')}
    />
  {/if}
{/snippet}

{#if initialReverse}
  {@render stackLayer()}
  {@render sidebarLayer()}
{:else}
  {@render sidebarLayer()}
  {@render stackLayer()}
{/if}
