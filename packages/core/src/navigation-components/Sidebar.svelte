<script lang="ts">
  import SidebarPrimitive from './primitives/SidebarPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SidebarProps<State, Action> {
    /**
     * Scoped store for the sidebar content.
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
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;

    /**
     * Side where the sidebar is positioned.
     * @default 'left'
     */
    side?: 'left' | 'right';

    /**
     * Width of the sidebar as CSS value.
     * @default '240px'
     */
    width?: string;
  }

  let {
    store,
    unstyled = false,
    class: className,
    disableEscapeKey = false,
    side = 'left',
    width = '240px',
    children
  }: SidebarProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultContentClasses = $derived(
    side === 'left'
      ? 'h-full border-r bg-background transition-all duration-300 ease-in-out'
      : 'h-full border-l bg-background transition-all duration-300 ease-in-out'
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: CSS transitions added for smooth layout changes (300ms)
  // Note: Sidebar is inline (not fixed/absolute), meant for layout integration
</script>

<!-- ============================================================================ -->
<!-- Styled Sidebar -->
<!-- ============================================================================ -->

<SidebarPrimitive {store} {disableEscapeKey} {side} {width}>
  {#snippet children({ visible, store, side, width })}
    <nav
      class={contentClasses}
      style="width: {width}"
      aria-label="Sidebar navigation"
    >
      {@render children?.({ visible, store, side, width })}
    </nav>
  {/snippet}
</SidebarPrimitive>
