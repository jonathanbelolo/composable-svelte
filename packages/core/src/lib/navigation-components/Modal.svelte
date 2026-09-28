<script lang="ts">
  import type { Snippet } from 'svelte';
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';
  import type { OverlayMotionHandle } from '../application/renderer/choreography/overlay-motion.js';
  import { assertPresentationView, type PresentationView } from '../navigation/managed-integration.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface ModalProps<State, Action> {
    /**
     * Declarative overlay motion from `useOverlayMotion`: default open/close plans and a presentation-bound
     * explicit entry. Without it (or without a motion engine) the built-in spring runs as before.
     */
    motion?: OverlayMotionHandle | undefined;

    /**
     * Managed presentation view for the modal content.
     */
    store?: PresentationView<State, Action> | undefined;

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
     * Omit the default and supplied CSS classes.
     * Inline centering transform, opacity and primitive behavior remain active.
     * @default false
     */
    unstyled?: boolean | undefined;

    /**
     * Classes merged with the default backdrop classes unless unstyled is true.
     * The primitive owns backdrop opacity during presentation transitions.
     */
    backdropClass?: string | undefined;

    /**
     * Classes merged with the default content classes unless unstyled is true.
     * The wrapper owns translate(-50%, -50%); the primitive composes its scale
     * animation with that centering transform and owns transition opacity.
     * Custom layout must retain the corresponding left/top centering anchor.
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
          store: PresentationView<State, Action> | undefined;
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
    children: renderContent,
    motion
  }: ModalProps<unknown, unknown> = $props();

  const admittedStore = $derived.by(() => {
    if (store !== undefined) {
      assertPresentationView(store);
    }
    return store;
  });

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
  {motion}
  store={admittedStore}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableClickOutside}
  {disableEscapeKey}
>
  {#snippet children({ visible, store: primitiveStore, bindBackdrop, bindContent, initialOpacity })}
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
      {@render renderContent?.({ visible, store: primitiveStore })}
    </div>
  {/snippet}
</ModalPrimitive>
