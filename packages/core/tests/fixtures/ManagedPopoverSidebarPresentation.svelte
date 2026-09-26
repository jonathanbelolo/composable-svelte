<script lang="ts">
  import { onDestroy } from 'svelte';
  import Popover from '../../src/lib/navigation-components/Popover.svelte';
  import PopoverPrimitive from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
  import Sidebar from '../../src/lib/navigation-components/Sidebar.svelte';
  import SidebarPrimitive from '../../src/lib/navigation-components/primitives/SidebarPrimitive.svelte';
  import { createStore } from '../../src/lib/store.svelte.js';
  import { Effect } from '../../src/lib/effect.js';
  import {
    ManagedIntegrationBuilder,
    optionalSlot,
    type PresentationView
  } from '../../src/lib/navigation/managed-integration.js';
  import type { Reducer } from '../../src/lib/types.js';
  import type { PresentationAction, PresentationState } from '../../src/lib/navigation/types.js';

  export type ItemState = { count: number; title: string };
  export type ItemAction = { type: 'increment' };
  export type RootState = {
    popover: ItemState | null;
    sidebar: ItemState | null;
    step: number;
  };
  export type RootAction =
    | { type: 'popover'; action: PresentationAction<ItemAction> }
    | { type: 'sidebar'; action: PresentationAction<ItemAction> }
    | { type: 'open'; family: 'popover' | 'sidebar'; count: number; title: string }
    | { type: 'close'; family: 'popover' | 'sidebar' }
    | { type: 'replace'; family: 'popover' | 'sidebar'; count: number; title: string };

  const popoverSlot = optionalSlot<RootState, RootAction>()('popover');
  const sidebarSlot = optionalSlot<RootState, RootAction>()('sidebar');

  const itemReducer: Reducer<ItemState, ItemAction> = (state, action) => {
    if (action.type === 'increment') return [{ ...state, count: state.count + 1 }, Effect.none()];
    return [state, Effect.none()];
  };

  const rootReducer: Reducer<RootState, RootAction> = (state, action) => {
    if (action.type === 'open') {
      return [{ ...state, [action.family]: { count: action.count, title: action.title } }, Effect.none()];
    }
    if (action.type === 'close') {
      return [{ ...state, [action.family]: null }, Effect.none()];
    }
    if (action.type === 'replace') {
      return [{ ...state, [action.family]: { count: action.count, title: action.title }, step: state.step + 1 }, Effect.none()];
    }
    return [state, Effect.none()];
  };

  const composition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>(rootReducer)
    .with(popoverSlot, itemReducer, {
      replaceOn: (action) => action.type === 'replace' && action.family === 'popover'
    })
    .with(sidebarSlot, itemReducer, {
      replaceOn: (action) => action.type === 'replace' && action.family === 'sidebar'
    })
    .build();

  interface Props {
    family?: 'popover' | 'sidebar';
    useWrapper?: boolean;
    store?: PresentationView<any, any> | undefined;
    presentation?: PresentationState<any> | undefined;
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    returnFocusTo?: HTMLElement | null;
    side?: 'left' | 'right';
    width?: string;
    onSnippetStore?: (store: unknown) => void;
    autoBind?: boolean;
  }

  let {
    family = 'popover',
    useWrapper = false,
    store: initialStore = undefined,
    presentation: initialPresentation = undefined,
    onPresentationComplete = undefined,
    onDismissalComplete = undefined,
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    side = 'left',
    width = '240px',
    onSnippetStore = undefined,
    autoBind = true
  }: Props = $props();

  const rootStore = createStore({
    initialState: { popover: null, sidebar: null, step: 0 } satisfies RootState,
    ...composition
  });
  onDestroy(() => rootStore.destroy());

  let boundView = $state.raw<PresentationView<ItemState, ItemAction> | undefined>(initialStore);
  let presentation = $state<PresentationState<any> | undefined>(initialPresentation);
  let snippetStoreObserved = $state.raw<unknown>(undefined);

  function syncView() {
    if (autoBind) {
      const slot = family === 'sidebar' ? sidebarSlot : popoverSlot;
      boundView = rootStore.state[family] !== null ? composition.bind(rootStore, slot) : undefined;
    }
  }

  export function open(count = 1, title = family === 'sidebar' ? 'Sidebar 1' : 'Popover 1') {
    rootStore.dispatch({ type: 'open', family, count, title });
    syncView();
  }

  export function replaceOwner(count = 2, title = family === 'sidebar' ? 'Sidebar 2' : 'Popover 2') {
    rootStore.dispatch({ type: 'replace', family, count, title });
    syncView();
  }

  export function close() {
    rootStore.dispatch({ type: 'close', family });
    syncView();
  }

  export function retireState() {
    close();
  }

  export function setBoundView(view: any) {
    boundView = view;
  }

  export function setPresentation(p: PresentationState<any> | undefined) {
    presentation = p;
  }

  export function getRootStore() {
    return rootStore;
  }

  export function getBoundView() {
    return boundView;
  }

  export function getSnippetStore() {
    return snippetStoreObserved;
  }

  function recordSnippet(node: HTMLElement, view: unknown) {
    snippetStoreObserved = view;
    onSnippetStore?.(view);
    return {
      update(next: unknown) {
        snippetStoreObserved = next;
        onSnippetStore?.(next);
      }
    };
  }
</script>

{#if family === 'popover'}
  {#if useWrapper}
    <Popover
      store={boundView}
      {presentation}
      {onPresentationComplete}
      {onDismissalComplete}
      {disableClickOutside}
      {disableEscapeKey}
    >
      {#snippet children({ visible, store: snippetStore })}
        <div use:recordSnippet={snippetStore} data-testid="popover-shell">
          {#if snippetStore?.state}
            <div data-testid="popover-live-content">
              <button data-testid="popover-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
            </div>
          {/if}
        </div>
      {/snippet}
    </Popover>
  {:else}
    <PopoverPrimitive
      store={boundView}
      {presentation}
      {onPresentationComplete}
      {onDismissalComplete}
      {disableClickOutside}
      {disableEscapeKey}
      {returnFocusTo}
    >
      {#snippet children({ visible, store: snippetStore, bindContent, initialOpacity })}
        <div use:bindContent data-testid="popover-content" style:opacity={initialOpacity}>
          <div use:recordSnippet={snippetStore} data-testid="popover-shell">
            {#if snippetStore?.state}
              <div data-testid="popover-live-content">
                <button data-testid="popover-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
              </div>
            {/if}
          </div>
        </div>
      {/snippet}
    </PopoverPrimitive>
  {/if}
{:else}
  {#if useWrapper}
    <Sidebar
      store={boundView}
      {presentation}
      {onPresentationComplete}
      {onDismissalComplete}
      {disableEscapeKey}
      {side}
      {width}
    >
      {#snippet children({ visible, store: snippetStore, side: s, width: w })}
        <div use:recordSnippet={snippetStore} data-testid="sidebar-shell" data-side={s} data-width={w}>
          {#if snippetStore?.state}
            <div data-testid="sidebar-live-content">
              <button data-testid="sidebar-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
            </div>
          {/if}
        </div>
      {/snippet}
    </Sidebar>
  {:else}
    <SidebarPrimitive
      store={boundView}
      {presentation}
      {onPresentationComplete}
      {onDismissalComplete}
      {disableEscapeKey}
      {side}
      {width}
    >
      {#snippet children({ visible, store: snippetStore, side: s, width: w, bindContent })}
        {#if visible}
          <div use:bindContent data-testid="sidebar-container" data-side={s} data-width={w}>
            <div use:recordSnippet={snippetStore} data-testid="sidebar-shell">
              {#if snippetStore?.state}
                <div data-testid="sidebar-live-content">
                  <button data-testid="sidebar-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {/snippet}
    </SidebarPrimitive>
  {/if}
{/if}
