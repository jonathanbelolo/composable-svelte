<script lang="ts">
  import { onDestroy } from 'svelte';
  import Modal from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
  import { Effect } from '../../src/lib/effect.js';
  import { createStore } from '../../src/lib/store.svelte.js';
  import { ManagedIntegrationBuilder, optionalSlot } from '../../src/lib/navigation/managed-integration.js';
  import type { PresentationAction } from '../../src/lib/navigation/types.js';
  import type { Reducer } from '../../src/lib/types.js';

  type Child = Record<string, never>;
  type Action = { type: 'noop' };
  type State = { editor: Child | null };
  type RootAction = { type: 'editor'; action: PresentationAction<Action> };
  const slot = optionalSlot<State, RootAction>()('editor');
  const reducer: Reducer<State, RootAction> = state => [state, Effect.none()];
  const child: Reducer<Child, Action> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(slot, child).build();
  const root = createStore({ initialState: { editor: {} }, ...composition });
  const view = $derived(composition.bind(root, slot));
  let confirming = $state(true);
  let draft = $state('Retained draft');
  onDestroy(() => root.destroy());
</script>
<Modal store={view}>
  {#snippet children({bindContent})}
    <section use:bindContent data-focus-removal-modal>
      <label>Draft <input bind:value={draft} data-surviving-draft /></label>
      {#if confirming}
        <div data-confirmation><button onclick={() => confirming = false}>Keep editing</button></div>
      {/if}
    </section>
  {/snippet}
</Modal>
