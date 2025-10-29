<script lang="ts">
  import SheetPrimitive from './primitives/SheetPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
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
     * Side from which the sheet slides in.
     * @default 'bottom'
     */
    side?: 'bottom' | 'left' | 'right';

    /**
     * Height of the sheet as CSS value (for bottom sheets).
     * @default '60vh'
     */
    height?: string;
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
    side = 'bottom',
    height = '60vh',
    children
  }: SheetProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed bottom-0 left-0 right-0 z-[61] border-t bg-background shadow-lg rounded-t-xl';

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );
</script>

<!-- ============================================================================ -->
<!-- Styled Sheet -->
<!-- ============================================================================ -->

<SheetPrimitive
  {store}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableClickOutside}
  {disableEscapeKey}
  {side}
  {height}
>
  {#snippet children({ visible, store, height, bindBackdrop, bindContent, initialOpacity })}
    {#if backdropClasses}
      <div
        use:bindBackdrop
        class={backdropClasses}
        aria-hidden="true"
        style:opacity={initialOpacity}
      ></div>
    {/if}

    <div
      use:bindContent
      class={contentClasses}
      style="height: {height}"
      style:opacity={initialOpacity}
      role="dialog"
      aria-modal="true"
      aria-label="Bottom sheet"
      data-dialog-type="sheet"
    >
      {@render children?.({ visible, store, height })}
    </div>
  {/snippet}
</SheetPrimitive>
