<script lang="ts">
  import type { Snippet } from 'svelte';
  import { portal } from '../../actions/portal.js';
  import { clickOutside } from '../../actions/clickOutside.js';
  import { focusTrap } from '../../actions/focusTrap.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import {
    animateAlertIn,
    animateAlertOut,
    animateBackdropIn,
    animateBackdropOut
  } from '../../animation/animate.js';

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
    presentation?: PresentationState<any> | undefined;

    /**
     * Callback when presentation animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'presentationCompleted' } }
     */
    onPresentationComplete?: (() => void) | undefined;

    /**
     * Callback when dismissal animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'dismissalCompleted' } }
     */
    onDismissalComplete?: (() => void) | undefined;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig> | undefined;

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
     * Element to return focus to when alert is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null | undefined;

    /**
     * Content snippet. Receives the primitive's render state.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ScopedDestinationStore<State, Action> | null;
          bindBackdrop: (node: HTMLElement) => void;
          bindContent: (node: HTMLElement) => void;
          initialOpacity: string | undefined;
        }
      ]
    >;
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
  // Animation Integration
  // ============================================================================

  let contentElement: HTMLElement | undefined = $state();
  let backdropElement: HTMLElement | undefined = $state();


  // The (status, content) pair this effect last acted on.
  //
  // Not $state: the effect below reads and writes it, and a reactive guard would
  // re-trigger the effect it lives in (effect_update_depth_exceeded).
  //
  // Keyed on the *pair*, not on "have I animated anything yet". Those two
  // questions only diverge when the component mounts already `presented` — SSR
  // hydration of a page rendered with this overlay open — and the difference is
  // a permanent deadlock: the collapse branch is refused, `dismissalCompleted`
  // never fires, and the reducer's own `status !== 'presented'` guard then
  // rejects every further dismiss.
  let lastAnimated: { status: string; content: unknown } | null = null;
  let clickOutsideCleanup: (() => void) | undefined = undefined;

  // Watch presentation status and trigger animations
  $effect(() => {
    if (!presentation || !contentElement || !backdropElement) return;

    if (presentation.status === 'idle') {
      lastAnimated = null;
      return;
    }

    const { status, content } = presentation;
    if (lastAnimated?.status === status && lastAnimated.content === content) return;
    lastAnimated = { status, content };

    if (status === 'presenting') {
      Promise.all([
        animateAlertIn(contentElement, springConfig),
        animateBackdropIn(backdropElement)
      ]).then(() => {
        queueMicrotask(() => onPresentationComplete?.());
      });
    }

    if (status === 'dismissing') {
      Promise.all([
        animateAlertOut(contentElement, springConfig),
        animateBackdropOut(backdropElement)
      ]).then(() => {
        queueMicrotask(() => onDismissalComplete?.());
      });
    }
  });

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

  function handleClickOutside(event: PointerEvent) {
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
    if (!visible) return;

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
      // Cleanup clickOutside action when alert unmounts
      clickOutsideCleanup?.();
      clickOutsideCleanup = undefined;
    };
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
    <!-- Backdrop (separate element for independent animation) -->
    <!-- Note: pointer-events: none allows clicks to pass through to clickOutside handler -->
    <div
      bind:this={backdropElement}
      class="alert-backdrop"
      aria-hidden="true"
      style:pointer-events="none"
    ></div>

    <!-- Content Container -->
    <div
      use:focusTrap={{ returnFocus: returnFocusTo }}
      style:pointer-events={interactionsEnabled ? 'auto' : 'none'}
    >
      {@render children?.({
        visible,
        store,
        bindBackdrop: (node: HTMLElement) => { backdropElement = node; },
        bindContent: (node: HTMLElement) => {
          contentElement = node;
          // Apply clickOutside to the content element
          if (!disableClickOutside) {
            const action = clickOutside(node, handleClickOutside);
            clickOutsideCleanup = action.destroy;
          }
        },
        initialOpacity: presentation?.status === 'presenting' ? '0' : undefined
      })}
    </div>
  </div>
{/if}

<style>
  .alert-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
</style>
