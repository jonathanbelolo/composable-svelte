<script lang="ts">
  import PopoverPrimitive from './primitives/PopoverPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface PopoverProps<State, Action> {
    /**
     * Scoped store for the popover content.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;

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
     * Custom positioning style.
     * User must provide absolute positioning via inline styles or classes.
     */
    style?: string;
  }

  let {
    store,
    unstyled = false,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    style = '',
    children
  }: PopoverProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultContentClasses =
    'absolute z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none';

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: No transitions/animations in Phase 2 - instant show/hide only
  // Note: Positioning must be provided by consumer via style prop
</script>

<!-- ============================================================================ -->
<!-- Styled Popover -->
<!-- ============================================================================ -->

<PopoverPrimitive {store} {disableClickOutside} {disableEscapeKey}>
  {#snippet children({ visible, store })}
    <div
      class={contentClasses}
      style={style}
      role="dialog"
      aria-modal="false"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</PopoverPrimitive>
