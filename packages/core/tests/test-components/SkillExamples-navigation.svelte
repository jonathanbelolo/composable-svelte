<script lang="ts">
  /**
   * Live markup pins for every Svelte fence in the managed-presentation section of
   * `.claude/skills/composable-svelte-navigation/SKILL.md`.
   */
  import type { Component } from 'svelte';
  import {
    Alert,
    AnimatedNavigationStack,
    Drawer,
    Modal,
    NavigationStack,
    Popover,
    Sheet,
    Sidebar
  } from '../../src/lib/navigation-components/index.js';
  import type { PresentationView } from '../../src/lib/navigation/managed-integration.js';
  import type { PresentationFeatureViewProps } from '../../src/lib/application/view-definition.js';
  import type { PresentationState } from '../../src/lib/navigation/types.js';

  type Screen = { type: 'step1' } | { type: 'step2' };
  interface State {
    stack: Screen[];
    presentation: PresentationState<Screen>;
  }
  type Action =
    | { type: 'save' }
    | { type: 'popped' };

  type LiveStore = PresentationView<State, Action>;
  type Surface = (node: HTMLElement) => void | { destroy?: () => void };

  let {
    store,
    surface,
    presentation,
    dispatch,
    Feature,
    Step1,
    Step2
  }: {
    store: LiveStore;
    surface: Surface;
    presentation: PresentationState<unknown>;
    dispatch: (action: { type: 'presentationCompleted' | 'dismissalCompleted' }) => void;
    Feature: Component<{ state: State; onAction: (action: Action) => void }>;
    Step1: Component<{ store: LiveStore }>;
    Step2: Component<{ store: LiveStore }>;
  } = $props();
</script>

{#snippet modalView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Edit item">
    <form use:surface>
      <button onclick={() => store.dispatch({ type: 'save' })}>Save</button>
      <button onclick={() => store.dismiss()}>Cancel</button>
    </form>
  </Modal>
{/snippet}

<Modal
  {store}
  {presentation}
  onPresentationComplete={() => dispatch({ type: 'presentationCompleted' })}
  onDismissalComplete={() => dispatch({ type: 'dismissalCompleted' })}
>
  <section use:surface>...</section>
</Modal>

<Modal {store} ariaLabel="Details"><section use:surface>...</section></Modal>
<Alert {store} ariaLabel="Confirm"><section use:surface>...</section></Alert>
<Sheet {store} side="bottom"><section use:surface>...</section></Sheet>
<Drawer {store} side="right"><section use:surface>...</section></Drawer>
<Popover {store} style="top: 3rem; right: 1rem"><section use:surface>...</section></Popover>
<Sidebar {store} side="left" width="240px"><nav use:surface>...</nav></Sidebar>

{#snippet featureView({ store, surface }: PresentationFeatureViewProps<State, Action>)}
  <Modal {store} ariaLabel="Feature">
    <section use:surface>
      {#if store.state}<Feature state={store.state} onAction={(action) => store.dispatch(action)} />{/if}
      <button onclick={() => store.dismiss()}>Close</button>
    </section>
  </Modal>
{/snippet}

<!-- Basic (no animations) -->
{#if store.state}
  <NavigationStack {store} stack={store.state.stack} onBack={() => store.dispatch({ type: 'popped' })}>
    {#snippet children({ currentScreen, canGoBack, onBack })}
      {@const screen = currentScreen as Screen | undefined}
      {#if screen?.type === 'step1'}
        <Step1 {store} />
      {:else if screen?.type === 'step2'}
        <Step2 {store} />
      {/if}
    {/snippet}
  </NavigationStack>
{/if}

<!-- With push/pop animations: also requires `presentation` -->
{#if store.state}
  <AnimatedNavigationStack
    {store}
    stack={store.state.stack}
    presentation={store.state.presentation}
    onBack={() => store.dispatch({ type: 'popped' })}
  >
    {#snippet children({ currentScreen })}
      <!-- same -->
    {/snippet}
  </AnimatedNavigationStack>
{/if}
