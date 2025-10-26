<script lang="ts">
  import SheetPrimitive from './primitives/SheetPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SheetProps<State, Action> {
    /**
     * Scoped store for the sheet content.
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

    /**
     * Height of the sheet as CSS value.
     * @default '60vh'
     */
    height?: string;
  }

  let {
    store,
    unstyled = false,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    height = '60vh',
    children
  }: SheetProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed bottom-0 left-0 right-0 z-50 border-t bg-background shadow-lg rounded-t-xl';

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: No transitions/animations in Phase 2 - instant show/hide only
</script>

<!-- ============================================================================ -->
<!-- Styled Sheet -->
<!-- ============================================================================ -->

<SheetPrimitive {store} {disableClickOutside} {disableEscapeKey} {height}>
  {#snippet children({ visible, store, height })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true"></div>
    {/if}

    <div
      class={contentClasses}
      style="height: {height}"
      role="dialog"
      aria-modal="true"
      aria-label="Bottom sheet"
    >
      {@render children?.({ visible, store, height })}
    </div>
  {/snippet}
</SheetPrimitive>
