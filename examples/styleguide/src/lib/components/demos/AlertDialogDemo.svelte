<script lang="ts">
  /**
   * `AlertDialog` — a titled, described confirmation over `Alert`.
   *
   * `Alert` is the shell: backdrop, container, spring lifecycle, click-outside
   * and Escape. It has a bare `children` snippet and nothing to say, so every
   * app that needed a confirmation wrote its own heading, paragraph and two
   * buttons — and the one in this repository announced itself to a screen
   * reader as "Alert dialog".
   *
   * The parts register themselves, so the root emits `aria-labelledby` and
   * `aria-describedby` only once something has claimed the id they would point
   * at. There is nothing for a consumer to keep in sync by hand.
   */
  import { createStore, Effect } from '@composable-svelte/core';
  import type { Effect as EffectType } from '@composable-svelte/core';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import {
    AlertDialog,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogAction,
    AlertDialogCancel
  } from '@composable-svelte/core/navigation-components';
  import { Button } from '@composable-svelte/core/components/ui';

  interface DemoState {
    open: boolean;
    presentation: PresentationState<boolean>;
    outcome: string | null;
  }

  type PresentationEvent = { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };

  type DemoAction =
    | { type: 'open' }
    | { type: 'confirmed' }
    | { type: 'cancelled' }
    | { type: 'presentation'; event: PresentationEvent };

  const dismissing = (state: DemoState, outcome: string): [DemoState, EffectType<DemoAction>] => [
    {
      ...state,
      outcome,
      presentation: {
        status: 'dismissing' as const,
        content: state.presentation.status === 'presented' ? state.presentation.content : true,
        duration: 200
      }
    },
    Effect.afterDelay<DemoAction>(200, (d) =>
      d({ type: 'presentation', event: { type: 'dismissalCompleted' } })
    )
  ];

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: { open: false, presentation: { status: 'idle' }, outcome: null },
    reducer: (state, action) => {
      switch (action.type) {
        case 'open':
          return [
            {
              ...state,
              open: true,
              outcome: null,
              presentation: { status: 'presenting' as const, content: true, duration: 300 }
            },
            Effect.afterDelay(300, (d) =>
              d({ type: 'presentation', event: { type: 'presentationCompleted' } })
            )
          ];

        // Both guarded on `presented`: dismissing something still animating in
        // is the invalid transition `PresentationState` exists to prevent.
        case 'confirmed':
          if (state.presentation.status !== 'presented') return [state, Effect.none()];
          return dismissing(state, 'Deleted.');

        case 'cancelled':
          if (state.presentation.status !== 'presented') return [state, Effect.none()];
          return dismissing(state, 'Kept.');

        case 'presentation':
          if (action.event.type === 'presentationCompleted') {
            return [
              {
                ...state,
                presentation: {
                  status: 'presented' as const,
                  content:
                    state.presentation.status === 'presenting' ? state.presentation.content : true
                }
              },
              Effect.none()
            ];
          }
          return [
            { ...state, open: false, presentation: { status: 'idle' as const } },
            Effect.none()
          ];

        default:
          return [state, Effect.none()];
      }
    },
    dependencies: {}
  });

  const state = $derived($demoStore);

  // The adapter `Alert` expects. The spread carries `scope`/`subscribe`
  // through; the explicit `state` overrides the store's non-reactive getter
  // with the `$`-subscribed snapshot.
  const storeWithDismiss = $derived({
    ...demoStore,
    state: $demoStore,
    dispatch: demoStore.dispatch,
    dismiss: () => demoStore.dispatch({ type: 'cancelled' })
  });
</script>

<div class="space-y-8">
  <section class="space-y-3">
    <h2 class="text-2xl font-bold">Alert Dialog</h2>
    <p class="text-muted-foreground">
      A destructive confirmation. The dialog is named by its own title, so a screen reader
      announces the question rather than the component.
    </p>

    <Button variant="destructive" onclick={() => demoStore.dispatch({ type: 'open' })}>
      Delete project
    </Button>

    {#if state.outcome}
      <p class="text-sm text-muted-foreground" role="status" aria-live="polite">
        {state.outcome}
      </p>
    {/if}
  </section>

  <section class="space-y-3">
    <h3 class="text-lg font-semibold">Why there is no trigger part</h3>
    <p class="text-muted-foreground text-sm">
      Radix needs an <code>AlertDialogTrigger</code> because it owns
      <code>open</code> imperatively. Here presentation is state-driven: the button above is an
      ordinary button dispatching into a reducer, and the dialog appears because the state says
      so. Shipping a trigger would be shipping a second, imperative way to open one.
    </p>
  </section>
</div>

{#if state.open}
  <AlertDialog
    store={storeWithDismiss}
    presentation={state.presentation}
    onPresentationComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
    onDismissalComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
  >
    {#snippet children()}
      <AlertDialogHeader>
        <AlertDialogTitle>Delete this project?</AlertDialogTitle>
        <AlertDialogDescription>
          Everything in it goes with it. This cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <!--
          `onclick` is required on both. A cancel that dismissed by itself would
          bypass the reducer that owns the dismissing → dismissalCompleted
          transition.
        -->
        <AlertDialogCancel onclick={() => demoStore.dispatch({ type: 'cancelled' })}>
          Keep it
        </AlertDialogCancel>
        <AlertDialogAction
          variant="destructive"
          onclick={() => demoStore.dispatch({ type: 'confirmed' })}
        >
          Delete
        </AlertDialogAction>
      </AlertDialogFooter>
    {/snippet}
  </AlertDialog>
{/if}
