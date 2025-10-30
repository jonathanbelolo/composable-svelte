<script lang="ts">
  import AlertPrimitive from './primitives/AlertPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../lib/utils.js';
  import { clickOutside } from '../lib/actions/clickOutside.js';
  import { focusTrap } from '../lib/actions/focusTrap.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface AlertProps<State, Action> {
    /**
     * Scoped store for the alert content.
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
  }: AlertProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultBackdropClasses =
    'fixed inset-0 z-50 bg-background/80 backdrop-blur-sm';

  const defaultContentClasses =
    'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg sm:rounded-lg';

  const backdropClasses = $derived(
    unstyled ? '' : cn(defaultBackdropClasses, backdropClass)
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );
</script>

<!-- ============================================================================ -->
<!-- Styled Alert -->
<!-- ============================================================================ -->

<AlertPrimitive
  {store}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableClickOutside}
  {disableEscapeKey}
>
  {#snippet children({
    visible,
    store,
    contentVisible,
    bindContent,
    bindBackdrop,
    onContentTransitionEnd,
    onBackdropTransitionEnd,
    clickOutsideHandler,
    focusTrapConfig,
    interactionsEnabled
  })}
    <!-- Backdrop with CSS transitions -->
    {#if backdropClasses}
      <div
        use:bindBackdrop
        class="{backdropClasses} transition-opacity duration-200"
        style="opacity: {contentVisible ? 1 : 0}"
        ontransitionend={onBackdropTransitionEnd}
        aria-hidden="true"
      ></div>
    {/if}

    <!-- Content with CSS transitions -->
    <div
      use:bindContent
      use:clickOutside={clickOutsideHandler}
      use:focusTrap={focusTrapConfig}
      class="{contentClasses} transition-all duration-200"
      style="opacity: {contentVisible ? 1 : 0}; transform: translate(-50%, -50%) scale({contentVisible ? 1 : 0.98})"
      style:pointer-events={interactionsEnabled ? 'auto' : 'none'}
      ontransitionend={onContentTransitionEnd}
      role="alertdialog"
      aria-modal="true"
      aria-label="Alert dialog"
      data-dialog-type="alert"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</AlertPrimitive>
