<script lang="ts">
  import type { Snippet } from 'svelte';
  import { portal } from '../../actions/portal.js';
  import { clickOutside } from '../../actions/clickOutside.js';
  import { focusTrap } from '../../actions/focusTrap.js';
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
     * Element to return focus to when drawer is dismissed.
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
          side: 'left' | 'right';
          width: string;
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
  // Not $state: the effect below reads and writes this, and a reactive
  // guard would re-trigger the effect it lives in (effect_update_depth_exceeded).
  let lastAnimatedContent: any = null;

  // Watch presentation status and trigger animations
  $effect(() => {
    if (!presentation || !contentElement || !backdropElement) return;

    // `content` exists on every status except `idle`.
    const currentContent = presentation.status === 'idle' ? null : presentation.content;

    if (
      presentation.status === 'presenting' &&
      lastAnimatedContent !== currentContent
    ) {
      lastAnimatedContent = currentContent;
      Promise.all([
        animateDrawerIn(contentElement, side, springConfig),
        animateBackdropIn(backdropElement)
      ]).then(() => {
        queueMicrotask(() => onPresentationComplete?.());
      });
    }

    if (presentation.status === 'dismissing' && lastAnimatedContent !== null) {
      lastAnimatedContent = null;
      Promise.all([
        animateDrawerOut(contentElement, side, springConfig),
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
    <!-- Content Container -->
    <div
      use:clickOutside={{ handler: handleClickOutside, enabled: () => !disableClickOutside }}
      use:focusTrap={{ returnFocus: returnFocusTo }}
      style:pointer-events={interactionsEnabled ? 'auto' : 'none'}
    >
      {@render children?.({
        visible,
        store,
        side,
        width,
        bindBackdrop: (node: HTMLElement) => { backdropElement = node; },
        bindContent: (node: HTMLElement) => { contentElement = node; },
        initialOpacity: presentation?.status === 'presenting' ? '0' : undefined
      })}
    </div>
  </div>
{/if}

