<script lang="ts">
  import { portal } from '../../lib/actions/portal.js';
  import { clickOutside } from '../../lib/actions/clickOutside.js';
  import { focusTrap } from '../../lib/actions/focusTrap.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface AlertPrimitiveProps<State, Action> {
    /**
     * Scoped store for the alert content.
     * When null, alert is hidden. When non-null, alert is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any>;

    /**
     * Callback when presentation animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'presentationCompleted' } }
     */
    onPresentationComplete?: () => void;

    /**
     * Callback when dismissal animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'dismissalCompleted' } }
     */
    onDismissalComplete?: () => void;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig>;

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
     * Element to return focus to when alert is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
  }

  let {
    store,
    presentation,
    onPresentationComplete,
    onDismissalComplete,
    springConfig,
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    children
  }: AlertPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  // Visible when store is non-null OR presentation is not idle
  // This ensures alert stays mounted during 'dismissing' state for exit animation
  const visible = $derived(
    (store !== null && store.state !== null) ||
      (presentation?.status !== 'idle' && presentation?.status !== undefined)
  );

  // Only allow interactions when fully presented
  const interactionsEnabled = $derived(
    presentation ? presentation.status === 'presented' : visible
  );

  // ============================================================================
  // CSS Transition Integration
  // ============================================================================

  let contentElement: HTMLElement | undefined = $state();
  let backdropElement: HTMLElement | undefined = $state();

  // Track which elements have completed transitions
  let contentTransitionComplete = $state(false);
  let backdropTransitionComplete = $state(false);

  // Compute animation states based on presentation status
  const contentAnimating = $derived(() => {
    if (!presentation) return false;
    return presentation.status === 'presenting' || presentation.status === 'dismissing';
  });

  const contentVisible = $derived(() => {
    if (!presentation) return visible;
    return presentation.status === 'presenting' || presentation.status === 'presented';
  });

  // Handle transitionend events
  function handleContentTransitionEnd(event: TransitionEvent) {
    if (event.target !== contentElement) return;

    contentTransitionComplete = true;
    console.log('[AlertPrimitive] Content transition ended');
    checkAnimationComplete();
  }

  function handleBackdropTransitionEnd(event: TransitionEvent) {
    if (event.target !== backdropElement) return;

    backdropTransitionComplete = true;
    console.log('[AlertPrimitive] Backdrop transition ended');
    checkAnimationComplete();
  }

  // Check if both animations are complete
  function checkAnimationComplete() {
    if (!contentTransitionComplete || !backdropTransitionComplete) return;
    if (!presentation) return;

    console.log('[AlertPrimitive] All transitions complete, status:', presentation.status);

    if (presentation.status === 'presenting') {
      console.log('[AlertPrimitive] Presentation complete');
      queueMicrotask(() => onPresentationComplete?.());
    } else if (presentation.status === 'dismissing') {
      console.log('[AlertPrimitive] Dismissal complete');
      queueMicrotask(() => onDismissalComplete?.());
    }

    // Reset for next animation
    contentTransitionComplete = false;
    backdropTransitionComplete = false;
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && store && interactionsEnabled) {
      event.preventDefault();
      try {
        store.dismiss();
      } catch (error) {
        console.error('[AlertPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store && interactionsEnabled) {
      try {
        store.dismiss();
      } catch (error) {
        console.error('[AlertPrimitive] Failed to dismiss:', error);
      }
    }
  }

  // ============================================================================
  // Side Effects
  // ============================================================================

  // Prevent body scroll when alert is open
  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  });
</script>

<!-- ============================================================================ -->
<!-- Keyboard Listeners -->
<!-- ============================================================================ -->

<svelte:window on:keydown={handleEscape} />

<!-- ============================================================================ -->
<!-- Portal Content -->
<!-- ============================================================================ -->

{#if visible}
  <div use:portal>
    {@render children?.({
      visible,
      store,
      contentVisible: contentVisible(),
      bindContent: (node: HTMLElement) => { contentElement = node; },
      bindBackdrop: (node: HTMLElement) => { backdropElement = node; },
      onContentTransitionEnd: handleContentTransitionEnd,
      onBackdropTransitionEnd: handleBackdropTransitionEnd,
      clickOutsideHandler: handleClickOutside,
      focusTrapConfig: { returnFocus: returnFocusTo },
      interactionsEnabled
    })}
  </div>
{/if}

<style>
  .alert-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
</style>
