<script lang="ts">
  import ModalPrimitive from './primitives/ModalPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../lib/utils.js';

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
    children
  }: ModalProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg';

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
  {#snippet children({ visible, store })}
    {#if backdropClasses}
      <div class={backdropClasses} aria-hidden="true"></div>
    {/if}

    <div
      class={contentClasses}
      role="dialog"
      aria-modal="true"
      aria-label="Modal dialog"
      data-dialog-type="modal"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</ModalPrimitive>
