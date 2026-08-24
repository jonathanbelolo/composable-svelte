<script lang="ts">
  import type { Snippet } from 'svelte';
  import { portal } from '../../actions/portal.js';
  import { clickOutside } from '../../actions/clickOutside.js';
  import { focusTrap } from '../../actions/focusTrap.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import {
    animateSheetIn,
    animateSheetOut,
    animateBackdropIn,
    animateBackdropOut
  } from '../../animation/animate.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SheetPrimitiveProps<State, Action> {
    /**
     * Scoped store for the sheet content.
     * When null, sheet is hidden. When non-null, sheet is visible.
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
     * Element to return focus to when sheet is dismissed.
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
          height: string;
          bindBackdrop: (node: HTMLElement) => void;
          bindContent: (node: HTMLElement) => void;
          initialOpacity: string | undefined;
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
    disableClickOutside = false,
    disableEscapeKey = false,
    side = 'bottom',
    height = '60vh',
    returnFocusTo = null,
    children
  }: SheetPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  // Visible when store is non-null OR presentation is not idle
  // This ensures sheet stays mounted during 'dismissing' state for exit animation
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

  let sheetContentElement: HTMLElement | undefined = $state();
  let sheetBackdropElement: HTMLElement | undefined = $state();


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

  // Watch presentation status and trigger animations
  $effect(() => {
    if (!presentation || !sheetContentElement || !sheetBackdropElement) return;

    if (presentation.status === 'idle') {
      lastAnimated = null;
      return;
    }

    const { status, content } = presentation;
    if (lastAnimated?.status === status && lastAnimated.content === content) return;
    lastAnimated = { status, content };

    if (status === 'presenting') {
      Promise.all([
        animateSheetIn(sheetContentElement, side, springConfig),
        animateBackdropIn(sheetBackdropElement)
      ]).then(() => {
        queueMicrotask(() => onPresentationComplete?.());
      });
    }

    if (status === 'dismissing') {
      Promise.all([
        animateSheetOut(sheetContentElement, side, springConfig),
        animateBackdropOut(sheetBackdropElement)
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
        console.error('[SheetPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store && interactionsEnabled) {
      try {
        store.dismiss();
      } catch (error) {
        console.error('[SheetPrimitive] Failed to dismiss:', error);
      }
    }
  }

  // ============================================================================
  // Side Effects
  // ============================================================================

  // Prevent body scroll when sheet is open
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
        height,
        bindBackdrop: (node: HTMLElement) => { sheetBackdropElement = node; },
        bindContent: (node: HTMLElement) => { sheetContentElement = node; },
        initialOpacity: presentation?.status === 'presenting' ? '0' : undefined
      })}
    </div>
  </div>
{/if}
