<script lang="ts">
  import {
    ApplicationHost,
    ApplicationRoot,
    FeatureOutlet,
    FeatureViews,
    ManagedIntegrationBuilder,
    defineApplication,
    defineViews,
    optionalSlot,
  } from '../../src/lib/application/index.js';
  import { Effect } from '../../src/lib/effect.js';
  import type { Reducer } from '../../src/lib/types.js';
  import type { PresentationAction } from '../../src/lib/navigation/types.js';
  import MotionGroupAuthorityChild from './MotionGroupAuthorityChild.svelte';

  type ChildState = { value: number };
  type ChildAction = { type: 'noop' };
  type State = { child: ChildState | null };
  type AppAction = { type: 'child'; action: PresentationAction<ChildAction> } | { type: 'remove' } | { type: 'replace' };
  const slot = optionalSlot<State, AppAction>()('child');
  const root: Reducer<State, AppAction> = (state, action) => [
    action.type === 'remove' ? { child: null } : action.type === 'replace' ? { child: { value: (state.child?.value ?? 0) + 1 } } : state,
    Effect.none(),
  ];
  const child: Reducer<ChildState, ChildAction> = (state) => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(root).with(slot, child, { replaceOn: (action) => action.type === 'replace' }).build();
  const definition = defineApplication(composition, { initialState: () => ({ child: { value: 0 } }) });
  const views = defineViews(composition, { child: { render: MotionGroupAuthorityChild } });
  const dependencies = {};
</script>

<ApplicationRoot {definition} options={{ dependencies, initial: { input: undefined } }}>
  {#snippet children(app)}
    <button data-testid="remove-child" onclick={() => app.store.dispatch({ type: 'remove' })}>remove child</button>
    <button data-testid="replace-child" onclick={() => app.store.dispatch({ type: 'replace' })}>replace child</button>
    <ApplicationHost {app}>
      <MotionGroupAuthorityChild mode="authority" />
      <FeatureViews store={app.store} definition={views}>
        {#snippet children(handles)}<FeatureOutlet view={handles.child} />{/snippet}
      </FeatureViews>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
