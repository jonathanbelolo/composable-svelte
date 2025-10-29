<script lang="ts">
  import SidebarPrimitive from './primitives/SidebarPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
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
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any>;

    /**
     * Callback when presentation animation completes.
     */
    onPresentationComplete?: () => void;

    /**
     * Callback when dismissal animation completes.
     */
    onDismissalComplete?: () => void;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig>;

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
    presentation,
    onPresentationComplete,
    onDismissalComplete,
    springConfig,
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
      ? 'h-full border-r bg-background overflow-hidden'
      : 'h-full border-l bg-background overflow-hidden'
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: Animations integrated via PresentationState (state-driven, not CSS)
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
