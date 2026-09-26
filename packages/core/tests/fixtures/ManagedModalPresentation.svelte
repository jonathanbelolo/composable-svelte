<script lang="ts">
  import { onDestroy } from 'svelte';
  import Modal from '../../src/lib/navigation-components/Modal.svelte';
  import ModalPrimitive from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
  import { createStore } from '../../src/lib/store.svelte.js';
  import { Effect } from '../../src/lib/effect.js';
  import {
    ManagedIntegrationBuilder,
    optionalSlot,
    type PresentationView
  } from '../../src/lib/navigation/managed-integration.js';
  import type { Reducer } from '../../src/lib/types.js';
  import type { PresentationAction, PresentationState } from '../../src/lib/navigation/types.js';

  export type ModalState = { count: number; title: string };
  export type ModalAction = { type: 'increment' };
  export type RootState = { modal: ModalState | null; step: number };
  export type RootAction =
    | { type: 'modal'; action: PresentationAction<ModalAction> }
    | { type: 'open'; count?: number; title?: string }
    | { type: 'close' }
    | { type: 'replaceModal'; count: number; title: string };

  const modalSlot = optionalSlot<RootState, RootAction>()('modal');
  const modalReducer: Reducer<ModalState, ModalAction> = (state, action) => {
    if (action.type === 'increment') return [{ ...state, count: state.count + 1 }, Effect.none()];
    return [state, Effect.none()];
  };
  const rootReducer: Reducer<RootState, RootAction> = (state, action) => {
    if (action.type === 'open') {
      return [{ ...state, modal: { count: action.count ?? 1, title: action.title ?? 'Modal 1' } }, Effect.none()];
    }
    if (action.type === 'close') {
      return [{ ...state, modal: null }, Effect.none()];
    }
    if (action.type === 'replaceModal') {
      return [{ ...state, modal: { count: action.count, title: action.title }, step: state.step + 1 }, Effect.none()];
    }
    return [state, Effect.none()];
  };

  const composition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>(rootReducer)
    .with(modalSlot, modalReducer, {
      replaceOn: (action) => action.type === 'replaceModal'
    })
    .build();

  interface Props {
    useWrapper?: boolean;
    store?: PresentationView<any, any> | undefined;
    presentation?: PresentationState<any> | undefined;
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    returnFocusTo?: HTMLElement | null;
    onSnippetStore?: (store: unknown) => void;
    autoBind?: boolean;
  }

  let {
    useWrapper = false,
    store: initialStore = undefined,
    presentation: initialPresentation = undefined,
    onPresentationComplete = undefined,
    onDismissalComplete = undefined,
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    onSnippetStore = undefined,
    autoBind = true
  }: Props = $props();

  const rootStore = createStore({
    initialState: { modal: null, step: 0 } satisfies RootState,
    ...composition
  });
  onDestroy(() => rootStore.destroy());

  // Capability identity is WeakSet-backed and must not be wrapped in a deep Svelte proxy.
  let boundView = $state.raw<PresentationView<ModalState, ModalAction> | undefined>(initialStore);
  let presentation = $state<PresentationState<any> | undefined>(initialPresentation);
  let snippetStoreObserved = $state.raw<unknown>(undefined);

  function syncView() {
    if (autoBind) {
      if (rootStore.state.modal !== null) {
        boundView = composition.bind(rootStore, modalSlot);
      } else {
        boundView = undefined;
      }
    }
  }

  export function open(count = 1, title = 'Modal 1') {
    rootStore.dispatch({ type: 'open', count, title });
    syncView();
  }

  export function replaceOwner(count = 2, title = 'Modal 2') {
    rootStore.dispatch({ type: 'replaceModal', count, title });
    syncView();
  }

  export function close() {
    rootStore.dispatch({ type: 'close' });
    syncView();
  }

  export function retireState() {
    rootStore.dispatch({ type: 'close' });
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

{#if useWrapper}
  <Modal
    store={boundView}
    {presentation}
    {onPresentationComplete}
    {onDismissalComplete}
    {disableClickOutside}
    {disableEscapeKey}
  >
    {#snippet children({ visible, store: snippetStore })}
      <div use:recordSnippet={snippetStore} data-testid="modal-shell">
        {#if snippetStore?.state}
          <div data-testid="modal-live-content">
            <button data-testid="modal-dismiss-btn" onclick={() => snippetStore?.dismiss()}>
              Dismiss
            </button>
          </div>
        {/if}
      </div>
    {/snippet}
  </Modal>
{:else}
  <ModalPrimitive
    store={boundView}
    {presentation}
    {onPresentationComplete}
    {onDismissalComplete}
    {disableClickOutside}
    {disableEscapeKey}
    {returnFocusTo}
  >
    {#snippet children({ visible, store: snippetStore, bindBackdrop, bindContent, initialOpacity })}
      <div
        use:bindBackdrop
        data-testid="modal-backdrop"
        style:opacity={initialOpacity}
      ></div>
      <div
        use:bindContent
        data-testid="modal-container"
        style:opacity={initialOpacity}
      >
        <div use:recordSnippet={snippetStore} data-testid="modal-shell">
          {#if snippetStore?.state}
            <div data-testid="modal-live-content">
              <button data-testid="modal-dismiss-btn" onclick={() => snippetStore?.dismiss()}>
                Dismiss
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/snippet}
  </ModalPrimitive>
{/if}
