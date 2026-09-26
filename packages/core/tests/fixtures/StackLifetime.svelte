<script lang="ts">
 import { untrack, onDestroy } from 'svelte';
 import AnimatedNavigationStack from '../../src/lib/navigation-components/AnimatedNavigationStack.svelte';
 import { createStore } from '../../src/lib/store.svelte.js';
 import { Effect } from '../../src/lib/effect.js';
 import {
  ManagedIntegrationBuilder,
  keyedSlot,
  type ChildView
 } from '../../src/lib/navigation/managed-integration.js';
 import type { Reducer } from '../../src/lib/types.js';
 import type { PresentationState } from '../../src/lib/navigation/types';
 type Screen = { label: string; id?: string };
 let { onComplete, withId = false }: { onComplete: (event: string) => void; withId?: boolean } = $props();
 let shown = $state(true);
 let stack: Screen[] = $state([{ label: 'root' }, { label: 'first', ...(withId ? { id: 'same' } : {}) }]);
 let presentation: PresentationState<Screen> = $state({ status: 'presenting', content: untrack(() => stack[1]!) });
 let springConfig = $state({ visualDuration: .2, bounce: 0 });
 export function updateConfig() { springConfig = { visualDuration: .25, bounce: 0 }; }

 interface KeyedState { items: Array<{ id: number; state: Record<string, never> }>; }
 type KeyedAction = { type: 'items'; id: number; action: never };
 const itemsSlot = keyedSlot<KeyedState, KeyedAction>()('items');
 const childReducer: Reducer<Record<string, never>, never> = (s) => [s, Effect.none()];
 const parentReducer: Reducer<KeyedState, KeyedAction> = (s) => [s, Effect.none()];
 const composition = new ManagedIntegrationBuilder<KeyedState, KeyedAction, undefined>(parentReducer)
  .forEach(itemsSlot, childReducer)
  .build();
 const parentStore = createStore({ initialState: { items: [{ id: 1, state: {} }] }, ...composition });
 const store: ChildView<Record<string, never>, never> = composition.bind(parentStore, itemsSlot.at(1))!;
 onDestroy(() => parentStore.destroy());

 export function hide() { shown = false; }
 export function replace(label: string) { stack = [stack[0]!, { label, ...(withId ? { id: 'same' } : {}) }]; presentation = { status: 'presenting', content: stack[1]! }; }
 export function presented() { presentation = { status: 'presented', content: stack[1]! }; }
 export function dismiss() { presentation = { status: 'dismissing', content: stack[1]! }; }
 export function idle() { stack = [stack[0]!]; presentation = { status: 'idle' }; }
</script>
{#if shown}
 <div style="width:200px;height:100px">
  <AnimatedNavigationStack {store} {stack} {presentation} {springConfig} onPresentationComplete={() => onComplete('presented:' + stack.at(-1)?.label)} onDismissalComplete={() => onComplete('dismissed:' + stack.at(-1)?.label)}>
   {#snippet children({ currentScreen })}<div data-screen>{(currentScreen as Screen).label}</div>{/snippet}
  </AnimatedNavigationStack>
 </div>
{/if}
