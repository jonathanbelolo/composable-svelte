<script lang="ts">
 import { onDestroy } from 'svelte';
 import Modal from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import Sheet from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
 import Popover from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
 import SnippetHost from './DocumentFocusSnippetHost.svelte';
 import { Effect } from '../../src/lib/effect.js';
 import { createStore } from '../../src/lib/store.svelte.js';
 import {
  ManagedIntegrationBuilder,
  optionalSlot
 } from '../../src/lib/navigation/managed-integration.js';
 import type { PresentationAction } from '../../src/lib/navigation/types.js';
 import type { Reducer } from '../../src/lib/types.js';

 let {innerKind = 'modal'}: {innerKind?: 'modal'|'popover'|'grandparent-snippet'|undefined}=$props();
 let outer=$state(true), inner=$state(true);

 type Child = Record<string, never>;
 type ChildAction = { type: 'noop' };
 type Root = { overlay: Child | null };
 type RootAction = { type: 'overlay'; action: PresentationAction<ChildAction> };

 const outerSlot = optionalSlot<Root, RootAction>()('overlay');
 const outerReducer: Reducer<Root, RootAction> = (state) => [state, Effect.none()];
 const childReducer: Reducer<Child, ChildAction> = (state) => [state, Effect.none()];
 const outerComposition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(outerReducer)
  .with(outerSlot, childReducer)
  .build();
 const outerRoot = createStore({ initialState: { overlay: {} }, ...outerComposition });
 onDestroy(() => outerRoot.destroy());
 const outerView = $derived(outerComposition.bind(outerRoot, outerSlot));

 const innerSlot = optionalSlot<Root, RootAction>()('overlay');
 const innerReducer: Reducer<Root, RootAction> = (state) => [state, Effect.none()];
 const innerComposition = new ManagedIntegrationBuilder<Root, RootAction, undefined>(innerReducer)
  .with(innerSlot, childReducer)
  .build();
 const innerRoot = createStore({ initialState: { overlay: {} }, ...innerComposition });
 onDestroy(() => innerRoot.destroy());
 const innerView = $derived(innerComposition.bind(innerRoot, innerSlot));
</script>
{#snippet grandparentInner()}
 {#if inner}
 <Sheet store={innerView}>
  {#snippet children({bindContent})}<section use:bindContent data-inner><button data-inner-first>Inner first</button><button onclick={()=>inner=false}>Close inner</button></section>{/snippet}
 </Sheet>
 {/if}
{/snippet}
<button data-trigger onclick={()=>outer=true}>Launcher</button>
<button data-close-inner onclick={()=>inner=false}>Close inner externally</button>
{#if outer}
{#if innerKind === 'grandparent-snippet'}
 <SnippetHost content={grandparentInner}/>
{:else}
<Modal store={outerView}>
 {#snippet children({bindContent})}
 <section use:bindContent data-outer>
  <button data-outer-first>Outer first</button>
  <button onclick={()=>outer=false}>Close outer</button>
  {#if inner}
   {#if innerKind === 'modal'}
    <Sheet store={innerView}>
     {#snippet children({bindContent})}<section use:bindContent data-inner><button data-inner-first>Inner first</button><button onclick={()=>inner=false}>Close inner</button></section>{/snippet}
    </Sheet>
   {:else}
    <Popover store={innerView}>
     {#snippet children({bindContent})}<section use:bindContent data-inner><button data-inner-first>Popover first</button><button onclick={()=>inner=false}>Close inner</button></section>{/snippet}
    </Popover>
   {/if}
  {/if}
 </section>
 {/snippet}
</Modal>
{/if}
{/if}
