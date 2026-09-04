<script lang="ts">
  import type { Snippet } from 'svelte';
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface ModalProps<State, Action> {
    /**
     * Scoped store for the modal content.
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
     * The id of the element that names this dialog — normally its title.
     *
     * Takes precedence over `ariaLabel`. Without one it announced the
     * hardcoded string "Modal dialog", which names the *component* and never what
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

    /** The id of the element describing this dialog. */
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
     * Content snippet. Receives the render state of the presented layer.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ScopedDestinationStore<State, Action> | null;
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
    children: renderContent
  }: ModalProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed left-[50%] top-[50%] z-[51] grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg sm:rounded-lg';

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );
</script>

<!-- ============================================================================ -->
<!-- Styled Modal -->
<!-- ============================================================================ -->

<ModalPrimitive
  {store}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableClickOutside}
  {disableEscapeKey}
>
  {#snippet children({ visible, store, bindBackdrop, bindContent, initialOpacity })}
    <div
      use:bindBackdrop
      class={backdropClasses}
      aria-hidden="true"
      style:opacity={initialOpacity}
    ></div>

    <div
      use:bindContent
      class={contentClasses}
      role="dialog"
      aria-modal="true"
      {...ariaLabelledby !== undefined
        ? { 'aria-labelledby': ariaLabelledby }
        : { 'aria-label': ariaLabel ?? 'Modal dialog' }}
      {...ariaDescribedby !== undefined ? { 'aria-describedby': ariaDescribedby } : {}}
      data-dialog-type="modal"
      style:opacity={initialOpacity}
      style:transform="translate(-50%, -50%)"
    >
      {@render renderContent?.({ visible, store })}
    </div>
  {/snippet}
</ModalPrimitive>
