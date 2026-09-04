<script lang="ts">
  import type { Snippet } from 'svelte';
  import SheetPrimitive from './primitives/SheetPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

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
     * The id of the element that names this sheet — normally its title.
     *
     * Takes precedence over `ariaLabel`. Without one it announced the
     * hardcoded string "Bottom sheet", which names the *component* and never what
     * it is for.
     */
    ariaLabelledby?: string | undefined;

    /**
     * A name, when there is no title element to point at.
     *
     * Ignored when `ariaLabelledby` is set. Defaults to the old hardcoded
     * string, so no existing caller changes behaviour.
     */
    ariaLabel?: string | undefined;

    /** The id of the element describing this sheet. */
    ariaDescribedby?: string | undefined;

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
     * Side from which the sheet slides in.
     * @default 'bottom'
     */
    side?: 'bottom' | 'left' | 'right' | undefined;

    /**
     * Height of the sheet as CSS value (for bottom sheets).
     * @default '60vh'
     */
    height?: string | undefined;

    /**
     * Content snippet. Receives the render state of the presented layer.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ScopedDestinationStore<State, Action> | null;
          height: string;
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
    ariaLabelledby,
    ariaLabel,
    ariaDescribedby,
    backdropClass,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    side = 'bottom',
    height = '60vh',
    children: renderContent
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
      {...ariaLabelledby !== undefined
        ? { 'aria-labelledby': ariaLabelledby }
        : { 'aria-label': ariaLabel ?? 'Bottom sheet' }}
      {...ariaDescribedby !== undefined ? { 'aria-describedby': ariaDescribedby } : {}}
      data-dialog-type="sheet"
    >
      {@render renderContent?.({ visible, store, height })}
    </div>
  {/snippet}
</SheetPrimitive>
