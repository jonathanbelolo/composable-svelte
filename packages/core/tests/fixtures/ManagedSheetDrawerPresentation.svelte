<script lang="ts">
  import { onDestroy } from 'svelte';
  import Sheet from '../../src/lib/navigation-components/Sheet.svelte';
  import SheetPrimitive from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
  import Drawer from '../../src/lib/navigation-components/Drawer.svelte';
  import DrawerPrimitive from '../../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
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
    sheet: ItemState | null;
    drawer: ItemState | null;
    step: number;
  };
  export type RootAction =
    | { type: 'sheet'; action: PresentationAction<ItemAction> }
    | { type: 'drawer'; action: PresentationAction<ItemAction> }
    | { type: 'openSheet'; count?: number; title?: string }
    | { type: 'openDrawer'; count?: number; title?: string }
    | { type: 'closeSheet' }
    | { type: 'closeDrawer' }
    | { type: 'replaceSheet'; count: number; title: string }
    | { type: 'replaceDrawer'; count: number; title: string };

  const sheetSlot = optionalSlot<RootState, RootAction>()('sheet');
  const drawerSlot = optionalSlot<RootState, RootAction>()('drawer');
  const itemReducer: Reducer<ItemState, ItemAction> = (state, action) =>
    action.type === 'increment' ? [{ ...state, count: state.count + 1 }, Effect.none()] : [state, Effect.none()];

  const rootReducer: Reducer<RootState, RootAction> = (state, action) => {
    if (action.type === 'openSheet') {
      return [{ ...state, sheet: { count: action.count ?? 1, title: action.title ?? 'Sheet 1' } }, Effect.none()];
    }
    if (action.type === 'openDrawer') {
      return [{ ...state, drawer: { count: action.count ?? 1, title: action.title ?? 'Drawer 1' } }, Effect.none()];
    }
    if (action.type === 'closeSheet') {
      return [{ ...state, sheet: null }, Effect.none()];
    }
    if (action.type === 'closeDrawer') {
      return [{ ...state, drawer: null }, Effect.none()];
    }
    if (action.type === 'replaceSheet') {
      return [{ ...state, sheet: { count: action.count, title: action.title }, step: state.step + 1 }, Effect.none()];
    }
    if (action.type === 'replaceDrawer') {
      return [{ ...state, drawer: { count: action.count, title: action.title }, step: state.step + 1 }, Effect.none()];
    }
    return [state, Effect.none()];
  };

  const composition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>(rootReducer)
    .with(sheetSlot, itemReducer, { replaceOn: (action) => action.type === 'replaceSheet' })
    .with(drawerSlot, itemReducer, { replaceOn: (action) => action.type === 'replaceDrawer' })
    .build();

  interface Props {
    family?: 'sheet' | 'drawer';
    useWrapper?: boolean;
    store?: PresentationView<any, any>;
    presentation?: PresentationState<any>;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    returnFocusTo?: HTMLElement | null;
    onSnippetStore?: (store: unknown) => void;
    autoBind?: boolean;
    side?: 'bottom' | 'left' | 'right';
    height?: string;
    width?: string;
  }

  let {
    family = 'sheet',
    useWrapper = false,
    store: initialStore = undefined,
    presentation: initialPresentation = undefined,
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    onSnippetStore = undefined,
    autoBind = true,
    side = undefined,
    height = '60vh',
    width = '320px'
  }: Props = $props();

  const rootStore = createStore({
    initialState: { sheet: null, drawer: null, step: 0 } satisfies RootState,
    ...composition
  });
  onDestroy(() => rootStore.destroy());

  let boundSheetView = $state.raw<PresentationView<ItemState, ItemAction> | undefined>(
    family === 'sheet' ? initialStore : undefined
  );
  let boundDrawerView = $state.raw<PresentationView<ItemState, ItemAction> | undefined>(
    family === 'drawer' ? initialStore : undefined
  );
  let presentation = $state<PresentationState<any> | undefined>(initialPresentation);
  let snippetStoreObserved = $state.raw<unknown>(undefined);

  function syncViews() {
    if (autoBind) {
      boundSheetView = rootStore.state.sheet !== null ? composition.bind(rootStore, sheetSlot) : undefined;
      boundDrawerView = rootStore.state.drawer !== null ? composition.bind(rootStore, drawerSlot) : undefined;
    }
  }

  export function open(count = 1, title?: string) {
    if (family === 'drawer') {
      rootStore.dispatch({ type: 'openDrawer', count, title: title ?? 'Drawer 1' });
    } else {
      rootStore.dispatch({ type: 'openSheet', count, title: title ?? 'Sheet 1' });
    }
    syncViews();
  }

  export function replaceOwner(count = 2, title?: string) {
    if (family === 'drawer') {
      rootStore.dispatch({ type: 'replaceDrawer', count, title: title ?? 'Drawer 2' });
    } else {
      rootStore.dispatch({ type: 'replaceSheet', count, title: title ?? 'Sheet 2' });
    }
    syncViews();
  }

  export function close() {
    if (family === 'drawer') {
      rootStore.dispatch({ type: 'closeDrawer' });
    } else {
      rootStore.dispatch({ type: 'closeSheet' });
    }
    syncViews();
  }

  export const retireState = close;
  export function setBoundView(view: any) {
    if (family === 'drawer') boundDrawerView = view;
    else boundSheetView = view;
  }
  export function setPresentation(p: PresentationState<any> | undefined) {
    presentation = p;
  }
  export function getRootStore() {
    return rootStore;
  }
  export function getBoundView() {
    return family === 'drawer' ? boundDrawerView : boundSheetView;
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

{#if family === 'sheet'}
  {#if useWrapper}
    <Sheet
      store={boundSheetView}
      {presentation}
      {disableClickOutside}
      {disableEscapeKey}
      side={side ?? 'bottom'}
      {height}
    >
      {#snippet children({ store: snippetStore, height: h })}
        <div use:recordSnippet={snippetStore} data-testid="sheet-shell" data-height={h}>
          {#if snippetStore?.state}
            <div data-testid="sheet-live-content">
              <button data-testid="sheet-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
            </div>
          {/if}
        </div>
      {/snippet}
    </Sheet>
  {:else}
    <SheetPrimitive
      store={boundSheetView}
      {presentation}
      {disableClickOutside}
      {disableEscapeKey}
      {returnFocusTo}
      side={side ?? 'bottom'}
      {height}
    >
      {#snippet children({ store: snippetStore, height: h, bindBackdrop, bindContent, initialOpacity })}
        <div use:bindBackdrop data-testid="sheet-backdrop" style:opacity={initialOpacity}></div>
        <div use:bindContent data-testid="sheet-container" style:opacity={initialOpacity}>
          <div use:recordSnippet={snippetStore} data-testid="sheet-shell" data-height={h}>
            {#if snippetStore?.state}
              <div data-testid="sheet-live-content">
                <button data-testid="sheet-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
              </div>
            {/if}
          </div>
        </div>
      {/snippet}
    </SheetPrimitive>
  {/if}
{:else}
  {#if useWrapper}
    <Drawer
      store={boundDrawerView}
      {presentation}
      {disableClickOutside}
      {disableEscapeKey}
      side={(side as 'left' | 'right') ?? 'left'}
      {width}
    >
      {#snippet children({ store: snippetStore, side: sd, width: w })}
        <div use:recordSnippet={snippetStore} data-testid="drawer-shell" data-side={sd} data-width={w}>
          {#if snippetStore?.state}
            <div data-testid="drawer-live-content">
              <button data-testid="drawer-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
            </div>
          {/if}
        </div>
      {/snippet}
    </Drawer>
  {:else}
    <DrawerPrimitive
      store={boundDrawerView}
      {presentation}
      {disableClickOutside}
      {disableEscapeKey}
      {returnFocusTo}
      side={(side as 'left' | 'right') ?? 'left'}
      {width}
    >
      {#snippet children({ store: snippetStore, side: sd, width: w, bindBackdrop, bindContent, initialOpacity })}
        <div use:bindBackdrop data-testid="drawer-backdrop" style:opacity={initialOpacity}></div>
        <div use:bindContent data-testid="drawer-container" style:opacity={initialOpacity}>
          <div use:recordSnippet={snippetStore} data-testid="drawer-shell" data-side={sd} data-width={w}>
            {#if snippetStore?.state}
              <div data-testid="drawer-live-content">
                <button data-testid="drawer-dismiss-btn" onclick={() => snippetStore?.dismiss()}>Dismiss</button>
              </div>
            {/if}
          </div>
        </div>
      {/snippet}
    </DrawerPrimitive>
  {/if}
{/if}
