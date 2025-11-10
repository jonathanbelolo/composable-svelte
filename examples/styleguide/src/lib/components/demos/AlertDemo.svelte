<script lang="ts">
  import { createStore, Effect } from '@composable-svelte/core';
  import type { PresentationState } from '@composable-svelte/core/navigation';
  import { Alert } from '@composable-svelte/core/navigation-components';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  interface DemoState {
    showAlert: boolean;
    presentation: PresentationState<boolean>;
    alertType: 'delete' | 'confirm' | 'warning';
  }

  type PresentationEvent =
    | { type: 'presentationCompleted' }
    | { type: 'dismissalCompleted' };

  type DemoAction =
    | { type: 'openAlert'; alertType: 'delete' | 'confirm' | 'warning' }
    | { type: 'closeAlert' }
    | { type: 'confirmAction' }
    | { type: 'presentation'; event: PresentationEvent };

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: {
      showAlert: false,
      presentation: { status: 'idle' },
      alertType: 'confirm'
    },
    reducer: (state, action) => {
      switch (action.type) {
        case 'openAlert':
          return [
            {
              ...state,
              showAlert: true,
              alertType: action.alertType,
              presentation: {
                status: 'presenting' as const,
                content: true,
                duration: 300
              }
            },
            Effect.afterDelay(300, (d) => d({ type: 'presentation', event: { type: 'presentationCompleted' } }))
          ];

        case 'closeAlert':
          // Only allow dismissal if we're in presented state
          if (state.presentation.status !== 'presented') {
            return [state, Effect.none()];
          }
          return [
            {
              ...state,
              presentation: {
                status: 'dismissing' as const,
                content: state.presentation.content,
                duration: 200
              }
            },
            Effect.afterDelay(200, (d) => d({ type: 'presentation', event: { type: 'dismissalCompleted' } }))
          ];

        case 'confirmAction':
          // Same as closeAlert but could have different logic
          if (state.presentation.status !== 'presented') {
            return [state, Effect.none()];
          }
          return [
            {
              ...state,
              presentation: {
                status: 'dismissing' as const,
                content: state.presentation.content,
                duration: 200
              }
            },
            Effect.afterDelay(200, (d) => d({ type: 'presentation', event: { type: 'dismissalCompleted' } }))
          ];

        case 'presentation':
          if (action.event.type === 'presentationCompleted') {
            return [
              {
                ...state,
                presentation: {
                  status: 'presented' as const,
                  content: state.presentation.status === 'presenting' ? state.presentation.content : true
                }
              },
              Effect.none()
            ];
          }
          if (action.event.type === 'dismissalCompleted') {
            return [
              {
                ...state,
                showAlert: false,
                presentation: { status: 'idle' as const }
              },
              Effect.none()
            ];
          }
          return [state, Effect.none()];

        default:
          return [state, Effect.none()];
      }
    },
    dependencies: {}
  });

  // Create a store wrapper with dismiss() method for Alert component
  const storeWithDismiss = $derived({
    ...demoStore,
    state: $demoStore,
    dispatch: demoStore.dispatch,
    dismiss: () => demoStore.dispatch({ type: 'closeAlert' })
  });

  const state = $derived($demoStore);

  // Alert content based on type
  const alertContent = $derived(() => {
    switch (state.alertType) {
      case 'delete':
        return {
          title: 'Delete Item',
          description: 'Are you sure you want to delete this item? This action cannot be undone.',
          confirmText: 'Delete',
          confirmClass: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
        };
      case 'warning':
        return {
          title: 'Warning',
          description: 'This action may have unintended consequences. Do you want to proceed?',
          confirmText: 'Proceed',
          confirmClass: 'bg-orange-600 text-white hover:bg-orange-700'
        };
      case 'confirm':
      default:
        return {
          title: 'Confirm Action',
          description: 'Are you sure you want to perform this action?',
          confirmText: 'Confirm',
          confirmClass: 'bg-primary text-primary-foreground hover:bg-primary/90'
        };
    }
  });
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click the buttons to trigger different types of alert dialogs
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <div class="flex flex-wrap gap-3 justify-center">
        <Button
          onclick={() => demoStore.dispatch({ type: 'openAlert', alertType: 'confirm' })}
          class="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Confirm Alert
        </Button>
        <Button
          onclick={() => demoStore.dispatch({ type: 'openAlert', alertType: 'warning' })}
          class="bg-orange-600 text-white hover:bg-orange-700"
        >
          Warning Alert
        </Button>
        <Button
          onclick={() => demoStore.dispatch({ type: 'openAlert', alertType: 'delete' })}
          class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          Delete Alert
        </Button>
      </div>
      <p class="text-sm text-muted-foreground">
        Alert is {state.showAlert ? 'open' : 'closed'}
      </p>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold">Usage</h3>
    <div class="prose prose-sm dark:prose-invert">
      <p>
        The Alert component provides confirmation dialogs for critical user actions.
        It blocks the interface to ensure users acknowledge important information or confirm
        destructive actions before proceeding. Key features include:
      </p>
      <ul>
        <li>Backdrop overlay to focus attention</li>
        <li>Center-positioned for maximum visibility</li>
        <li>ESC key support for cancellation</li>
        <li>Focus trap to ensure keyboard accessibility</li>
        <li>Smooth enter/exit animations via presentation system</li>
      </ul>
    </div>
  </section>

  <!-- Features Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Key Features</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⚠️</div>
        <h4 class="font-semibold">Critical Actions</h4>
        <p class="text-sm text-muted-foreground">
          Require explicit confirmation for destructive or important actions
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">🎯</div>
        <h4 class="font-semibold">Focused Attention</h4>
        <p class="text-sm text-muted-foreground">
          Center-positioned with backdrop to capture user focus
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⌨️</div>
        <h4 class="font-semibold">Keyboard Accessible</h4>
        <p class="text-sm text-muted-foreground">
          Focus trap and ESC key support for full keyboard control
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">✨</div>
        <h4 class="font-semibold">State-Driven Animations</h4>
        <p class="text-sm text-muted-foreground">
          Smooth animations via presentation system with Motion One
        </p>
      </div>
    </div>
  </section>

  <!-- Use Cases Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Common Use Cases</h3>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Delete Confirmation</h4>
        <p class="text-sm text-muted-foreground">
          Confirm before permanently deleting user data
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Action Warning</h4>
        <p class="text-sm text-muted-foreground">
          Warn users about potentially dangerous actions
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <h4 class="font-semibold">Form Submission</h4>
        <p class="text-sm text-muted-foreground">
          Confirm before submitting critical forms or changes
        </p>
      </div>
    </div>
  </section>

  <!-- Best Practices -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Best Practices</h3>
    </div>

    <div class="space-y-4">
      <div class="rounded-lg border bg-card p-6">
        <h4 class="font-semibold mb-3">When to Use Alerts</h4>
        <ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
          <li>Destructive actions that cannot be undone (delete, remove, clear)</li>
          <li>Actions with significant consequences (publish, submit, send)</li>
          <li>Critical system warnings that require acknowledgment</li>
          <li>Confirmation before leaving unsaved changes</li>
        </ul>
      </div>

      <div class="rounded-lg border bg-card p-6">
        <h4 class="font-semibold mb-3">When NOT to Use Alerts</h4>
        <ul class="list-disc list-inside text-sm space-y-2 text-muted-foreground">
          <li>Simple informational messages (use toast or notification instead)</li>
          <li>Non-critical confirmations (use inline confirmation)</li>
          <li>Frequent actions that would annoy users</li>
          <li>Complex forms or multi-step workflows (use modal or sheet)</li>
        </ul>
      </div>
    </div>
  </section>
</div>

<!-- Alert Implementation -->
{#if state.showAlert}
  <Alert
    store={storeWithDismiss}
    presentation={state.presentation}
    onPresentationComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'presentationCompleted' } })}
    onDismissalComplete={() =>
      demoStore.dispatch({ type: 'presentation', event: { type: 'dismissalCompleted' } })}
  >
    {#snippet children()}
      <div class="space-y-6">
        <!-- Alert Header -->
        <div class="space-y-2">
          <h2 class="text-2xl font-bold">{alertContent().title}</h2>
          <p class="text-muted-foreground">
            {alertContent().description}
          </p>
        </div>

        <!-- Alert Actions -->
        <div class="flex justify-end gap-3">
          <Button
            class="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onclick={() => demoStore.dispatch({ type: 'closeAlert' })}
          >
            Cancel
          </Button>
          <Button
            class={alertContent().confirmClass}
            onclick={() => demoStore.dispatch({ type: 'confirmAction' })}
          >
            {alertContent().confirmText}
          </Button>
        </div>
      </div>
    {/snippet}
  </Alert>
{/if}
