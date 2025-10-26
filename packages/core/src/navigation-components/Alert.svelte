<script lang="ts">
  import AlertPrimitive from './primitives/AlertPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface AlertProps<State, Action> {
    /**
     * Scoped store for the alert content.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;

    /**
     * Override backdrop classes.
     */
    backdropClass?: string;

    /**
     * Override content container classes.
     */
    class?: string;

    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean;

    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;
  }

  let {
    store,
    unstyled = false,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    children
  }: AlertProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg';

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: No transitions/animations in Phase 2 - instant show/hide only
</script>

<!-- ============================================================================ -->
<!-- Styled Alert -->
<!-- ============================================================================ -->

<AlertPrimitive {store} {disableClickOutside} {disableEscapeKey}>
  {#snippet children({ visible, store })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true"></div>
    {/if}

    <div
      class={contentClasses}
      role="alertdialog"
      aria-modal="true"
      aria-label="Alert dialog"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</AlertPrimitive>
