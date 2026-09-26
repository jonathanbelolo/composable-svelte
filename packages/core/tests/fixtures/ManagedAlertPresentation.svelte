<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte';
  import Alert from '../../src/lib/navigation-components/Alert.svelte';
  import AlertPrimitive from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
  import AlertDialog from '../../src/lib/navigation-components/alert-dialog/AlertDialog.svelte';
  import { createStore } from '../../src/lib/store.svelte.js';
  import { Effect } from '../../src/lib/effect.js';
  import {
    ManagedIntegrationBuilder,
    optionalSlot,
    type PresentationView
  } from '../../src/lib/navigation/managed-integration.js';
  import type { Reducer } from '../../src/lib/types.js';
  import type { PresentationAction, PresentationState } from '../../src/lib/navigation/types.js';

  export type AlertState = { count: number; title: string; message?: string };
  export type AlertAction =
    | { type: 'increment' }
    | { type: 'confirm' }
    | { type: 'cancel' };
  export type RootState = { alert: AlertState | null; step: number };
  export type RootAction =
    | { type: 'alert'; action: PresentationAction<AlertAction> }
    | { type: 'open'; count?: number; title?: string; message?: string }
    | { type: 'close' }
    | { type: 'replaceAlert'; count: number; title: string; message?: string };

  const alertSlot = optionalSlot<RootState, RootAction>()('alert');
  const alertReducer: Reducer<AlertState, AlertAction> = (state, action) => {
    if (action.type === 'increment') return [{ ...state, count: state.count + 1 }, Effect.none()];
    if (action.type === 'confirm') return [{ ...state, count: state.count + 10 }, Effect.none()];
    if (action.type === 'cancel') return [state, Effect.none()];
    return [state, Effect.none()];
  };
  const rootReducer: Reducer<RootState, RootAction> = (state, action) => {
    if (action.type === 'open') {
      return [
        {
          ...state,
          alert: {
            count: action.count ?? 1,
            title: action.title ?? 'Alert 1',
            message: action.message ?? 'Alert Message'
          }
        },
        Effect.none()
      ];
    }
    if (action.type === 'close') {
      return [{ ...state, alert: null }, Effect.none()];
    }
    if (action.type === 'replaceAlert') {
      return [
        {
          ...state,
          alert: {
            count: action.count,
            title: action.title,
            message: action.message ?? 'Replaced Message'
          },
          step: state.step + 1
        },
        Effect.none()
      ];
    }
    return [state, Effect.none()];
  };

  const composition = new ManagedIntegrationBuilder<RootState, RootAction, undefined>(rootReducer)
    .with(alertSlot, alertReducer, {
      replaceOn: (action) => action.type === 'replaceAlert'
    })
    .build();

  interface Props {
    mode?: 'primitive' | 'alert' | 'alertDialog';
    useWrapper?: boolean;
    useAlertDialog?: boolean;
    store?: PresentationView<any, any> | undefined;
    presentation?: PresentationState<any> | undefined;
    onPresentationComplete?: () => void;
    onDismissalComplete?: () => void;
    disableClickOutside?: boolean;
    disableEscapeKey?: boolean;
    returnFocusTo?: HTMLElement | null;
    onSnippetStore?: (store: unknown) => void;
    autoBind?: boolean;
    title?: string | Snippet | undefined;
    description?: string | Snippet | undefined;
    ariaLabel?: string | undefined;
    ariaLabelledby?: string | undefined;
    ariaDescribedby?: string | undefined;
    backdropClass?: string | undefined;
    class?: string | undefined;
    unstyled?: boolean | undefined;
  }

  let {
    mode = undefined,
    useWrapper = false,
    useAlertDialog = false,
    store: initialStore = undefined,
    presentation: initialPresentation = undefined,
    onPresentationComplete = undefined,
    onDismissalComplete = undefined,
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    onSnippetStore = undefined,
    autoBind = true,
    title = undefined,
    description = undefined,
    ariaLabel = undefined,
    ariaLabelledby = undefined,
    ariaDescribedby = undefined,
    backdropClass = undefined,
    class: className = undefined,
    unstyled = false
  }: Props = $props();

  const rootStore = createStore({
    initialState: { alert: null, step: 0 } satisfies RootState,
    ...composition
  });
  onDestroy(() => rootStore.destroy());

  // Capability identity is WeakSet-backed and must not be wrapped in a deep Svelte proxy.
  let boundView = $state.raw<PresentationView<AlertState, AlertAction> | undefined>(initialStore);
  let presentation = $state<PresentationState<any> | undefined>(initialPresentation);
  let snippetStoreObserved = $state.raw<unknown>(undefined);

  function syncView() {
    if (autoBind) {
      if (rootStore.state.alert !== null) {
        boundView = composition.bind(rootStore, alertSlot);
      } else {
        boundView = undefined;
      }
    }
  }

  export function open(count = 1, title = 'Alert 1', message = 'Alert Message') {
    rootStore.dispatch({ type: 'open', count, title, message });
    syncView();
  }

  export function replaceOwner(count = 2, title = 'Alert 2', message = 'Replaced Message') {
    rootStore.dispatch({ type: 'replaceAlert', count, title, message });
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

  const activeMode = $derived(
    mode ?? (useAlertDialog ? 'alertDialog' : useWrapper ? 'alert' : 'primitive')
  );
</script>

{#if activeMode === 'alertDialog'}
  <AlertDialog
    store={boundView}
    {presentation}
    {onPresentationComplete}
    {onDismissalComplete}
    {disableClickOutside}
    {disableEscapeKey}
    {title}
    {description}
    {ariaLabel}
    {unstyled}
    {backdropClass}
    class={className}
  >
    {#snippet children({ visible, store: snippetStore })}
      <div use:recordSnippet={snippetStore} data-testid="alert-shell">
        {#if snippetStore?.state}
          <div data-testid="alert-live-content">
            <span data-testid="alert-title">{(snippetStore.state as AlertState).title}</span>
            <button data-testid="alert-dismiss-btn" onclick={() => snippetStore?.dismiss()}>
              Dismiss
            </button>
            <button data-testid="alert-action-btn" onclick={() => snippetStore?.dispatch({ type: 'confirm' })}>
              Confirm
            </button>
          </div>
        {/if}
      </div>
    {/snippet}
  </AlertDialog>
{:else if activeMode === 'alert'}
  <Alert
    store={boundView}
    {presentation}
    {onPresentationComplete}
    {onDismissalComplete}
    {disableClickOutside}
    {disableEscapeKey}
    {ariaLabelledby}
    {ariaLabel}
    {ariaDescribedby}
    {unstyled}
    {backdropClass}
    class={className}
  >
    {#snippet children({ visible, store: snippetStore })}
      <div use:recordSnippet={snippetStore} data-testid="alert-shell">
        {#if snippetStore?.state}
          <div data-testid="alert-live-content">
            <span data-testid="alert-title">{(snippetStore.state as AlertState).title}</span>
            <button data-testid="alert-dismiss-btn" onclick={() => snippetStore?.dismiss()}>
              Dismiss
            </button>
            <button data-testid="alert-action-btn" onclick={() => snippetStore?.dispatch({ type: 'confirm' })}>
              Confirm
            </button>
          </div>
        {/if}
      </div>
    {/snippet}
  </Alert>
{:else}
  <AlertPrimitive
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
        data-testid="alert-backdrop"
        style:opacity={initialOpacity}
      ></div>
      <div
        use:bindContent
        data-testid="alert-container"
        style:opacity={initialOpacity}
      >
        <div use:recordSnippet={snippetStore} data-testid="alert-shell">
          {#if snippetStore?.state}
            <div data-testid="alert-live-content">
              <span data-testid="alert-title">{(snippetStore.state as AlertState).title}</span>
              <button data-testid="alert-dismiss-btn" onclick={() => snippetStore?.dismiss()}>
                Dismiss
              </button>
              <button data-testid="alert-action-btn" onclick={() => snippetStore?.dispatch({ type: 'confirm' })}>
                Confirm
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/snippet}
  </AlertPrimitive>
{/if}
