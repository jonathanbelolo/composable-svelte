<script lang="ts">
  import { Effect } from '@composable-svelte/core';
  import type { Effect as EffectType, Reducer } from '@composable-svelte/core';
  import { ApplicationHost, ApplicationRoot, defineApplication, ManagedIntegrationBuilder, optionalSlot, scopeTo } from '@composable-svelte/core/application';
  import type { PresentationAction, PresentationState } from '@composable-svelte/core/navigation';
  import { AlertDialog, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@composable-svelte/core/navigation-components';
  import { Button } from '@composable-svelte/core/components/ui';

  interface DemoState {
    open: boolean;
    dialogContent: boolean | null;
    presentation: PresentationState<boolean>;
    outcome: string | null;
  }
  type DialogContentAction = { type: 'presentationCompleted' } | { type: 'dismissalCompleted' };
  type DemoAction =
    | { type: 'open' }
    | { type: 'confirmed' }
    | { type: 'cancelled' }
    | { type: 'dialogContent'; action: PresentationAction<DialogContentAction> };

  const dismissing = (state: DemoState, outcome: string): [DemoState, EffectType<DemoAction>] => [
    { ...state, outcome, presentation: { status: 'dismissing', content: true, duration: 200 } },
    Effect.none()
  ];
  const reducer: Reducer<DemoState, DemoAction, undefined> = (state, action) => {
    if (action.type === 'dialogContent') {
      if (action.action.type === 'dismiss') {
        return state.presentation.status === 'presented' ? dismissing(state, 'Kept.') : [state, Effect.none()];
      }
      if (action.action.action.type === 'presentationCompleted') {
        if (state.presentation.status !== 'presenting') return [state, Effect.none()];
        return [{ ...state, presentation: { status: 'presented', content: state.presentation.content } }, Effect.none()];
      }
      if (state.presentation.status !== 'dismissing') return [state, Effect.none()];
      return [{ ...state, open: false, dialogContent: null, presentation: { status: 'idle' } }, Effect.none()];
    }
    switch (action.type) {
      case 'open':
        return [{ ...state, open: true, dialogContent: true, outcome: null, presentation: { status: 'presenting', content: true, duration: 300 } }, Effect.none()];
      case 'confirmed':
        return state.presentation.status === 'presented' ? dismissing(state, 'Deleted.') : [state, Effect.none()];
      case 'cancelled':
        return state.presentation.status === 'presented' ? dismissing(state, 'Kept.') : [state, Effect.none()];
      default:
        return [state, Effect.none()];
    }
  };
  const dialogSlot = optionalSlot<DemoState, DemoAction>()('dialogContent');
  const childReducer: Reducer<boolean, DialogContentAction, undefined> = state => [state, Effect.none()];
  const composition = new ManagedIntegrationBuilder(reducer).with(dialogSlot, childReducer, {
    dismissal: 'deferred',
    replaceOn: action => action.type === 'open'
  }).build();
  const application = defineApplication(composition, {
    initialState: (): DemoState => ({ open: false, dialogContent: null, presentation: { status: 'idle' }, outcome: null })
  });
</script>

<ApplicationRoot definition={application} options={{ dependencies: undefined, initial: { input: undefined } }}>
{#snippet children(app)}
<ApplicationHost {app}>
{@const demoStore = app.store}
{@const state = app.store.state}
{@const dialogView = scopeTo(app.store, dialogSlot)}
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
  <!-- Interim legacy PresentationState bridge; the managed view owns lifetime and dismissal authority. -->
  <AlertDialog
    store={dialogView}
    presentation={state.presentation}
    onPresentationComplete={() => dialogView?.dispatch({ type: 'presentationCompleted' })}
    onDismissalComplete={() => dialogView?.dispatch({ type: 'dismissalCompleted' })}
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
</ApplicationHost>
{/snippet}
</ApplicationRoot>
