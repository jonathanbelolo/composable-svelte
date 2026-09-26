<script lang="ts">
 import { onDestroy, type Snippet } from 'svelte';
 import Modal from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import { Effect } from '../../src/lib/effect.js';
 import { createStore } from '../../src/lib/store.svelte.js';
 import {
  ManagedIntegrationBuilder,
  optionalSlot
 } from '../../src/lib/navigation/managed-integration.js';
 import type { PresentationAction } from '../../src/lib/navigation/types.js';
 import type { Reducer } from '../../src/lib/types.js';

 let { content }: { content: Snippet } = $props();

 type Child = Record<string, never>;
 type ChildAction = { type: 'noop' };
 type Root = { overlay: Child | null };
 type RootAction = { type: 'overlay'; action: PresentationAction<ChildAction> };
 const overlaySlot = optionalSlot<Root, RootAction>()('overlay');
 const reducer: Reducer<Root, RootAction> = (state) => [state, Effect.none()];
 const childReducer: Reducer<Child, ChildAction> = (state) => [state, Effect.none()];
 const composition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(reducer)
  .with(overlaySlot, childReducer)
  .build();
 const root = createStore({ initialState: { overlay: {} }, ...composition });
 onDestroy(() => root.destroy());
 const view = $derived(composition.bind(root, overlaySlot));
</script>

<Modal store={view}>
 {#snippet children({bindContent})}
  <section use:bindContent data-outer>
   <button data-outer-first>Outer first</button>
   {@render content()}
  </section>
 {/snippet}
</Modal>
