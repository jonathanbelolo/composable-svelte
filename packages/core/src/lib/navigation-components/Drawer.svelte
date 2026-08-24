<script lang="ts">
  import type { Snippet } from 'svelte';
  import DrawerPrimitive from './primitives/DrawerPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

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
    presentation?: PresentationState<any> | undefined;

    /**
     * Callback when presentation animation completes.
     */
    onPresentationComplete?: (() => void) | undefined;

    /**
     * Callback when dismissal animation completes.
     */
    onDismissalComplete?: (() => void) | undefined;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig> | undefined;

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean | undefined;

    /**
     * Override backdrop classes.
     */
    backdropClass?: string | undefined;

    /**
     * Override content container classes.
     */
    class?: string | undefined;

    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean | undefined;

    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean | undefined;

    /**
     * Side from which the drawer slides in.
     * @default 'left'
     */
    side?: 'left' | 'right' | undefined;

    /**
     * Width of the drawer as CSS value.
     * @default '320px'
     */
    width?: string | undefined;

    /**
     * Content snippet. Receives the render state of the presented layer.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ScopedDestinationStore<State, Action> | null;
          side: 'left' | 'right';
          width: string;
        }
      ]
    > | undefined;
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
    children: renderContent
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
  {#snippet children({ visible, store, side, width, bindBackdrop, bindContent, initialOpacity })}
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
      style:width={width}
      style:opacity={initialOpacity}
      role="dialog"
      aria-modal="true"
      aria-label="Side drawer"
    >
      {@render renderContent?.({ visible, store, side, width })}
    </div>
  {/snippet}
</DrawerPrimitive>
