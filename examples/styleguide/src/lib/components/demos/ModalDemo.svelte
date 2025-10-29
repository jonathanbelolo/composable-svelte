<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { Modal } from '@composable-svelte/core/navigation-components';
  import Button from '@composable-svelte/core/components/ui/button/Button.svelte';

  interface DemoState {
    showModal: boolean;
  }

  type DemoAction =
    | { type: 'openModal' }
    | { type: 'closeModal' };

  const demoStore = createStore<DemoState, DemoAction>({
    initialState: { showModal: false },
    reducer: (state, action) => {
      switch (action.type) {
        case 'openModal':
          return [{ showModal: true }, { _tag: 'None' as const }];
        case 'closeModal':
          return [{ showModal: false }, { _tag: 'None' as const }];
        default:
          return [state, { _tag: 'None' as const }];
      }
    },
    dependencies: {}
  });

  const state = $derived(demoStore.state);
</script>

<div class="space-y-12">
  <!-- Live Demo Section -->
  <section class="space-y-6">
    <div>
      <h3 class="text-xl font-semibold mb-2">Interactive Demo</h3>
      <p class="text-muted-foreground text-sm">
        Click the button to open a modal dialog
      </p>
    </div>

    <div class="flex flex-col items-center justify-center gap-6 p-12 rounded-lg border-2 bg-card">
      <Button onclick={() => demoStore.dispatch({ type: 'openModal' })}>
        Open Modal
      </Button>
      <p class="text-sm text-muted-foreground">
        Modal is {state.showModal ? 'open' : 'closed'}
      </p>
    </div>
  </section>

  <!-- Description -->
  <section class="space-y-4">
    <h3 class="text-xl font-semibold">Usage</h3>
    <div class="prose prose-sm dark:prose-invert">
      <p>
        The Modal component provides a full-screen overlay dialog for displaying content
        that requires user attention or interaction. It includes:
      </p>
      <ul>
        <li>Backdrop overlay with customizable opacity</li>
        <li>Focus trap to keep keyboard navigation within the modal</li>
        <li>ESC key support for closing</li>
        <li>Click-outside-to-close functionality (optional)</li>
        <li>Animation support for enter/exit transitions</li>
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
        <div class="text-2xl">🎯</div>
        <h4 class="font-semibold">Focus Management</h4>
        <p class="text-sm text-muted-foreground">
          Automatically traps focus within the modal and restores it when closed
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">⌨️</div>
        <h4 class="font-semibold">Keyboard Support</h4>
        <p class="text-sm text-muted-foreground">
          Press ESC to close, Tab to navigate between elements
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">🎨</div>
        <h4 class="font-semibold">Customizable Styling</h4>
        <p class="text-sm text-muted-foreground">
          Full control over appearance with Tailwind CSS classes
        </p>
      </div>

      <div class="rounded-lg border bg-card p-6 space-y-3">
        <div class="text-2xl">✨</div>
        <h4 class="font-semibold">Animated Transitions</h4>
        <p class="text-sm text-muted-foreground">
          Smooth enter and exit animations with Svelte transitions
        </p>
      </div>
    </div>
  </section>
</div>

<!-- Modal Implementation -->
{#if state.showModal}
  <Modal
    store={demoStore}
    onDismiss={() => demoStore.dispatch({ type: 'closeModal' })}
  >
    {#snippet children()}
      <div class="bg-background rounded-lg shadow-xl max-w-md w-full p-6 space-y-6">
        <div>
          <h2 class="text-2xl font-bold">Modal Title</h2>
          <p class="text-muted-foreground mt-2">
            This is a modal dialog. You can put any content here.
          </p>
        </div>

        <div class="space-y-4">
          <p class="text-sm">
            The modal will close when you:
          </p>
          <ul class="list-disc list-inside text-sm space-y-1 text-muted-foreground">
            <li>Press the ESC key</li>
            <li>Click the backdrop (outside this card)</li>
            <li>Click the close button below</li>
          </ul>
        </div>

        <div class="flex justify-end gap-3">
          <Button
            class="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            onclick={() => demoStore.dispatch({ type: 'closeModal' })}
          >
            Cancel
          </Button>
          <Button
            class="bg-primary text-primary-foreground hover:bg-primary/90"
            onclick={() => demoStore.dispatch({ type: 'closeModal' })}
          >
            Confirm
          </Button>
        </div>
      </div>
    {/snippet}
  </Modal>
{/if}
