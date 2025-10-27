<script lang="ts">
  import DrawerPrimitive from './primitives/DrawerPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface DrawerProps<State, Action> {
    /**
     * Scoped store for the drawer content.
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
     * Side from which the drawer slides in.
     * @default 'left'
     */
    side?: 'left' | 'right';

    /**
     * Width of the drawer as CSS value.
     * @default '320px'
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
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    side = 'left',
    width = '320px',
    children
  }: DrawerProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses = $derived(
    side === 'left'
      ? 'fixed left-0 top-0 bottom-0 z-50 border-r bg-background shadow-lg'
      : 'fixed right-0 top-0 bottom-0 z-50 border-l bg-background shadow-lg'
  );

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: Animations integrated in Phase 4 via presentation prop
</script>

<!-- ============================================================================ -->
<!-- Styled Drawer -->
<!-- ============================================================================ -->

<DrawerPrimitive
  {store}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableClickOutside}
  {disableEscapeKey}
  {side}
  {width}
>
  {#snippet children({ visible, store, side, width })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true"></div>
    {/if}

    <div
      class={contentClasses}
      style="width: {width}"
      role="dialog"
      aria-modal="true"
      aria-label="Side drawer"
    >
      {@render children?.({ visible, store, side, width })}
    </div>
  {/snippet}
</DrawerPrimitive>
