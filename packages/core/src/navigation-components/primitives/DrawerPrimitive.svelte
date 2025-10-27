<script lang="ts">
  import { portal } from '../../lib/actions/portal.js';
  import { clickOutside } from '../../lib/actions/clickOutside.js';
  import { focusTrap } from '../../lib/actions/focusTrap.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import {
    animateDrawerIn,
    animateDrawerOut,
    animateBackdropIn,
    animateBackdropOut
  } from '../../animation/animate.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface DrawerPrimitiveProps<State, Action> {
    /**
     * Scoped store for the drawer content.
     * When null, drawer is hidden. When non-null, drawer is visible.
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
     * Side from which the drawer slides in.
     * @default 'left'
     */
    side?: 'left' | 'right';

    /**
     * Width of the drawer as CSS value.
     * @default '320px'
     */
    width?: string;

    /**
     * Element to return focus to when drawer is dismissed.
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
    side = 'left',
    width = '320px',
    returnFocusTo = null,
    children
  }: DrawerPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  // Visible when store is non-null OR presentation is not idle
  // This ensures drawer stays mounted during 'dismissing' state for exit animation
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

  // Track last animated content to prevent duplicate animations
  let lastAnimatedContent: any = $state(null);

  // Watch presentation status and trigger animations
  $effect(() => {
    if (!presentation || !contentElement || !backdropElement) return;

    const currentContent = presentation.content;

    if (
      presentation.status === 'presenting' &&
      lastAnimatedContent !== currentContent
    ) {
      lastAnimatedContent = currentContent;
      console.log('[DrawerPrimitive] Starting presentation animation for', currentContent);
      Promise.all([
        animateDrawerIn(contentElement, side, springConfig),
        animateBackdropIn(backdropElement)
      ]).then(() => {
        console.log(
          '[DrawerPrimitive] Animation completed, calling onPresentationComplete'
        );
        queueMicrotask(() => onPresentationComplete?.());
      });
    }

    if (presentation.status === 'dismissing' && lastAnimatedContent !== null) {
      lastAnimatedContent = null;
      console.log('[DrawerPrimitive] Starting dismissal animation');
      Promise.all([
        animateDrawerOut(contentElement, side, springConfig),
        animateBackdropOut(backdropElement)
      ]).then(() => {
        console.log(
          '[DrawerPrimitive] Dismissal animation completed, calling onDismissalComplete'
        );
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
        console.error('[DrawerPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store && interactionsEnabled) {
      try {
        store.dismiss();
      } catch (error) {
        console.error('[DrawerPrimitive] Failed to dismiss:', error);
      }
    }
  }

  // ============================================================================
  // Side Effects
  // ============================================================================

  // Prevent body scroll when drawer is open
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
    <!-- Backdrop (separate element for independent animation) -->
    <!-- Note: pointer-events: none allows clicks to pass through to clickOutside handler -->
    <div
      bind:this={backdropElement}
      class="drawer-backdrop"
      aria-hidden="true"
      style:pointer-events="none"
    ></div>

    <!-- Content Container -->
    <div
      bind:this={contentElement}
      use:clickOutside={handleClickOutside}
      use:focusTrap={{ returnFocus: returnFocusTo }}
      style:pointer-events={interactionsEnabled ? 'auto' : 'none'}
    >
      {@render children?.({ visible, store, side, width })}
    </div>
  </div>
{/if}

<style>
  .drawer-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
  }
</style>
