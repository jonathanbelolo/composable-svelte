<script lang="ts">
 import { onDestroy } from 'svelte';
 import Alert from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
 import { Effect } from '../../src/lib/effect.js';
 import { createStore } from '../../src/lib/store.svelte.js';
 import {
  ManagedIntegrationBuilder,
  optionalSlot
 } from '../../src/lib/navigation/managed-integration.js';
 import type { PresentationAction } from '../../src/lib/navigation/types.js';
 import type { Reducer } from '../../src/lib/types.js';

 type Child = Record<string, never>;
 type ChildAction = { type: 'noop' };
 type Root = { overlay: Child | null };
 type RootAction =
  | { type: 'hide' }
  | { type: 'overlay'; action: PresentationAction<ChildAction> };

 const overlaySlot = optionalSlot<Root, RootAction>()('overlay');
 const reducer: Reducer<Root, RootAction> = (state, action) => {
  if (action.type === 'hide') {
   return [{ ...state, overlay: null }, Effect.none()];
  }
  return [state, Effect.none()];
 };
 const childReducer: Reducer<Child, ChildAction> = (state) => [state, Effect.none()];
 const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(reducer)
  .with(overlaySlot, childReducer)
  .build();
 const root = createStore({ initialState: { overlay: {} }, ...composition });
 onDestroy(() => root.destroy());
 const view = $derived(composition.bind(root, overlaySlot));
</script>
<button data-hide-alert onclick={() => { root.dispatch({ type: 'hide' }); }}>Hide</button>
<Alert store={view}>
 {#snippet children({bindContent})}
  <div use:bindContent data-scroll-alert>Alert</div>
 {/snippet}
</Alert>
