<script lang="ts">
  import Alert from './Alert.svelte';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface AlertButton {
    label: string;
    variant?: 'default' | 'destructive' | 'secondary';
    onclick: () => void;
  }

  interface AlertDialogProps {
    /**
     * Whether the alert is visible.
     */
    visible: boolean;

    /**
     * Alert title.
     */
    title: string;

    /**
     * Alert message.
     */
    message: string;

    /**
     * Action buttons.
     */
    buttons: AlertButton[];

    /**
     * Disable all default styling.
     * @default false
     */
    unstyled?: boolean;

    /**
     * Override content container classes.
     */
    class?: string;
  }

  let {
    visible,
    title,
    message,
    buttons,
    unstyled = false,
    class: className
  }: AlertDialogProps = $props();

  // Create a fake scoped store that just checks visible flag
  const fakeStore = $derived(
    visible
      ? {
          state: { visible: true },
          dispatch: () => {},
          dismiss: () => {}
        }
      : null
  );

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const buttonClasses = {
    default: 'px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90',
    destructive: 'px-4 py-2 bg-destructive text-destructive-foreground rounded-md hover:opacity-90',
    secondary: 'px-4 py-2 border-2 border-border rounded-md hover:bg-accent'
  };
</script>

<!-- ============================================================================ -->
<!-- Alert Dialog -->
<!-- ============================================================================ -->

<Alert store={fakeStore} {unstyled} class={className}>
  {#snippet children()}
    <div class="space-y-4">
      <!-- Title -->
      <h2 class="text-xl font-semibold">{title}</h2>

      <!-- Message -->
      <p class="text-muted-foreground">{message}</p>

      <!-- Buttons -->
      <div class="flex gap-3 justify-end">
        {#each buttons as button}
          <button
            onclick={button.onclick}
            class={cn(buttonClasses[button.variant || 'default'])}
          >
            {button.label}
          </button>
        {/each}
      </div>
    </div>
  {/snippet}
</Alert>
