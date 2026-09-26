<script lang="ts">
  import type { Snippet } from 'svelte';
  import { Effect } from '@composable-svelte/core';
  import type { Reducer } from '@composable-svelte/core';
  import {
    ApplicationHost,
    ApplicationRoot,
    defineApplication,
    ManagedIntegrationBuilder,
    optionalSlot,
    scopeTo
  } from '@composable-svelte/core/application';
  import type { PresentationAction } from '@composable-svelte/core/navigation';
  import { Modal } from '@composable-svelte/core/navigation-components';

  interface State { content: boolean | null }
  type ContentAction = { type: 'noop' };
  type Action = { type: 'content'; action: PresentationAction<ContentAction> };
  interface Dependencies { onDismiss(): void }

  const slot = optionalSlot<State, Action>()('content');
  const reducer: Reducer<State, Action, Dependencies> = (state, action, dependencies) => {
    if (action.type === 'content' && action.action.type === 'dismiss') {
      return [{ content: null }, Effect.run(() => dependencies.onDismiss())];
    }
    return [state, Effect.none()];
  };
  const childReducer: Reducer<boolean, ContentAction, Dependencies> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(slot, childReducer).build();
  const application = defineApplication(composition, {
    initialState: (expanded: boolean): State => ({ content: expanded ? true : null })
  });

  let { expanded, onDismiss, children: content }: {
    expanded: boolean;
    onDismiss(): void;
    children: Snippet;
  } = $props();
</script>

{#key expanded}
  <ApplicationRoot definition={application} options={{ dependencies: { onDismiss }, initial: { input: expanded } }}>
    {#snippet children(app)}
      <ApplicationHost {app}>
        {@const modalView = scopeTo(app.store, slot)}
        <Modal store={modalView}>
          {#snippet children()}
            {@render content()}
          {/snippet}
        </Modal>
      </ApplicationHost>
    {/snippet}
  </ApplicationRoot>
{/key}
