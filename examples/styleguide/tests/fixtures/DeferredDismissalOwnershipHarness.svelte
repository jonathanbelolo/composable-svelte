<script lang="ts">
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
  import type { PresentationView } from '@composable-svelte/core/application';
  import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
  import { Modal } from '@composable-svelte/core/navigation-components';

  interface ChildState { id: number; label: string }
  type ChildAction =
    | { type: 'rename'; label: string }
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };
  interface State {
    child: ChildState | null;
    nextId: number;
    presentation: PresentationState<ChildState>;
  }
  type Action =
    | { type: 'open' }
    | { type: 'child'; action: PresentationAction<ChildAction> };

  let { observe }: { observe: (view: PresentationView<ChildState, ChildAction>) => void } = $props();

  const childReducer: Reducer<ChildState, ChildAction, undefined> = (state, action) =>
    action.type === 'rename' ? [{ ...state, label: action.label }, Effect.none()] : [state, Effect.none()];
  const reducer: Reducer<State, Action, undefined> = (state, action) => {
    if (action.type === 'child') {
      if (action.action.type === 'dismiss') {
        if (state.presentation.status !== 'presented') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'dismissing', content: state.presentation.content } }, Effect.none()];
      }
      if (action.action.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'presented', content: state.presentation.content } }, Effect.none()];
      }
      if (action.action.action.type === 'dismissalCompleted') {
        if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
        return [{ ...state, child: null, presentation: { status: 'idle' } }, Effect.none()];
      }
    }
    if (action.type === 'open') {
      const child = { id: state.nextId, label: 'initial' };
      return [{ child, nextId: state.nextId + 1, presentation: { status: 'presenting', content: child } }, Effect.none()];
    }
    return [state, Effect.none()];
  };

  const childSlot = optionalSlot<State, Action>()('child');
  const composition = new ManagedIntegrationBuilder(reducer).with(childSlot, childReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'open'
  }).build();
  const application = defineApplication(composition, {
    initialState: (): State => ({ child: null, nextId: 1, presentation: { status: 'idle' } })
  });
</script>

<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
  {#snippet children(app)}
    <ApplicationHost {app}>
      {@const state = app.store.state}
      {@const childView = scopeTo(app.store, childSlot)}
      <button onclick={() => app.store.dispatch({ type: 'open' })}>Open owner</button>
      {#if childView}
        <button onclick={() => childView.dispatch({ type: 'rename', label: 'updated' })}>Update owner</button>
        <button onclick={() => observe(childView)}>Capture owner</button>
      {/if}
      {#if state.child}
        {@const child = state.child}
        <Modal
          store={childView}
          presentation={state.presentation}
          onPresentationComplete={() => childView?.dispatch({ type: 'presentationCompleted' })}
          onDismissalComplete={() => childView?.dispatch({ type: 'dismissalCompleted' })}
        >
          {#snippet children()}
            <p>{child.id}:{child.label}</p>
          {/snippet}
        </Modal>
      {/if}
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
