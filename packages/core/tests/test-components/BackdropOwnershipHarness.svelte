<script lang="ts">
  import { onDestroy } from 'svelte';
  import Modal from '../../src/lib/navigation-components/Modal.svelte';
  import Alert from '../../src/lib/navigation-components/Alert.svelte';
  import Drawer from '../../src/lib/navigation-components/Drawer.svelte';
  import Sheet from '../../src/lib/navigation-components/Sheet.svelte';
  import { Effect } from '../../src/lib/effect.js';
  import { createStore } from '../../src/lib/store.svelte.js';
  import {
    ManagedIntegrationBuilder,
    optionalSlot
  } from '../../src/lib/navigation/managed-integration.js';
  import type { PresentationAction } from '../../src/lib/navigation/types.js';
  import type { Reducer } from '../../src/lib/types.js';

  interface Props {
    componentType?: 'modal' | 'sheet' | 'drawer' | 'alert';
    disableClickOutside?: boolean;
    isOpen?: boolean;
    onDismiss?: () => void;
    backdropClass?: string;
  }

  let {
    componentType = 'drawer',
    disableClickOutside = $bindable(false),
    isOpen = $bindable(true),
    onDismiss,
    backdropClass = 'test-backdrop'
  }: Props = $props();

  let dismissCount = $state(0);

  type Child = { title: string };
  type ChildAction = { type: 'noop' };
  type Root = { overlay: Child | null };
  type RootAction =
    | { type: 'open'; title: string }
    | { type: 'close' }
    | { type: 'overlay'; action: PresentationAction<ChildAction> };

  const overlaySlot = optionalSlot<Root, RootAction>()('overlay');
  const childReducer: Reducer<Child, ChildAction> = (state) => [state, Effect.none()];
  const reducer: Reducer<Root, RootAction> = (state, action) => {
    if (action.type === 'open') {
      return [{ ...state, overlay: { title: action.title } }, Effect.none()];
    }
    if (action.type === 'close') {
      return [{ ...state, overlay: null }, Effect.none()];
    }
    if (action.type === 'overlay' && action.action?.type === 'dismiss') {
      return [
        { ...state, overlay: { title: `${componentType} title` } },
        Effect.fireAndForget(() => {
          dismissCount++;
          onDismiss?.();
        })
      ];
    }
    return [state, Effect.none()];
  };

  const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(reducer)
    .with(overlaySlot, childReducer)
    .build();
  const root = createStore({
    initialState: { overlay: isOpen ? { title: `${componentType} title` } : null },
    ...composition
  });
  onDestroy(() => root.destroy());

  $effect(() => {
    if (isOpen && !root.state.overlay) {
      root.dispatch({ type: 'open', title: `${componentType} title` });
    } else if (!isOpen && root.state.overlay) {
      root.dispatch({ type: 'close' });
    }
  });

  const store = $derived(isOpen ? composition.bind(root, overlaySlot) : undefined);
</script>

<div>
  <div data-testid="controls">
    <button data-testid="toggle-disable" onclick={() => { disableClickOutside = !disableClickOutside; }}>
      Toggle Disable
    </button>
    <button data-testid="toggle-open" onclick={() => { isOpen = !isOpen; }}>
      Toggle Open
    </button>
    <span data-testid="dismiss-count">{dismissCount}</span>
  </div>

  {#if componentType === 'modal'}
    <Modal
      {store}
      {disableClickOutside}
      {backdropClass}
      ariaLabel="Test Modal"
    >
      {#snippet children()}
        <div data-testid="modal-content">
          <h2 data-testid="content-title">Modal Content</h2>
          <button data-testid="content-button" onclick={() => {}}>Inside Modal Button</button>
        </div>
      {/snippet}
    </Modal>
  {:else if componentType === 'alert'}
    <Alert
      {store}
      {disableClickOutside}
      {backdropClass}
      ariaLabel="Test Alert"
    >
      {#snippet children()}
        <div data-testid="alert-content">
          <h2 data-testid="content-title">Alert Content</h2>
          <button data-testid="content-button" onclick={() => {}}>Inside Alert Button</button>
        </div>
      {/snippet}
    </Alert>
  {:else if componentType === 'drawer'}
    <Drawer
      {store}
      {disableClickOutside}
      {backdropClass}
      ariaLabel="Test Drawer"
    >
      {#snippet children()}
        <div data-testid="drawer-content">
          <h2 data-testid="content-title">Drawer Content</h2>
          <button data-testid="content-button" onclick={() => {}}>Inside Drawer Button</button>
        </div>
      {/snippet}
    </Drawer>
  {:else}
    <Sheet
      {store}
      {disableClickOutside}
      {backdropClass}
      ariaLabel="Test Sheet"
    >
      {#snippet children()}
        <div data-testid="sheet-content">
          <h2 data-testid="content-title">Sheet Content</h2>
          <button data-testid="content-button" onclick={() => {}}>Inside Sheet Button</button>
        </div>
      {/snippet}
    </Sheet>
  {/if}
</div>
