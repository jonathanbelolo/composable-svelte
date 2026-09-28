<script lang="ts">
  import { onDestroy, type Snippet, untrack } from 'svelte';
  import { portal } from '../../actions/portal.js';
  import { overlayLayer } from '../../actions/overlayLayers.js';
  import { overlayInstance, claimPresentationMotion, noteOverlayRoles, registerOverlayProbe } from './overlayMotion.js';
  import type { OverlayMotionHandle } from '../../application/renderer/choreography/overlay-motion.js';
  import { createDismissalBoundary } from '../../actions/dismissalBoundary.js';
  const registerDismissalLayer = createDismissalBoundary();
  import { documentScrollLock } from '../../actions/documentScrollLock.js';
  import { assertPresentationView, type PresentationView } from '../../navigation/managed-integration.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import { createRemovedContentDismissal } from './presentationCompletion.js';
  import {
    animateModalIn,
    animateModalOut,
    animateBackdropIn,
    animateBackdropOut
  } from '../../animation/animate.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface ModalPrimitiveProps<State, Action> {
    /**
     * Declarative overlay motion (`useOverlayMotion`). When its plan claims an accepted transition, the
     * choreography drives this overlay's visuals instead of the built-in spring; completion callbacks still fire once.
     */
    motion?: OverlayMotionHandle | undefined;

    /**
     * Managed presentation view for the modal content.
     * When undefined or retired, modal is hidden (unless presentation retains exit shell).
     */
    store?: PresentationView<State, Action> | undefined;

    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any> | undefined;

    /**
     * Callback when presentation animation completes.
     * Route an application-defined completion action through the captured presentation view.
     */
    onPresentationComplete?: (() => void) | undefined;

    /**
     * Callback when dismissal animation completes.
     * Route a distinct application-defined completion action through the captured presentation view.
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
     * Element to return focus to when modal is dismissed.
     * Typically the button that opened the modal.
     * If not provided, focus returns to the element that was focused before modal opened.
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
          store: PresentationView<State, Action> | undefined;
          bindBackdrop: (node: HTMLElement) => void;
          bindContent: (node: HTMLElement) => { destroy: () => void };
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
    returnFocusTo = null,
    children,
    motion
  }: ModalPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Membership & Derived State
  // ============================================================================

  const admittedStore = $derived.by(() => {
    if (store !== undefined) {
      assertPresentationView(store);
    }
    return store;
  });

  // Visible when admitted store has live state OR presentation is not idle
  // This ensures modal stays mounted during 'dismissing' state for exit animation
  const visible = $derived(
    (admittedStore !== undefined && admittedStore.state !== undefined) ||
      (presentation?.status !== 'idle' && presentation?.status !== undefined)
  );

  // Focus authority retires at 'dismissing'; pointer/Escape shielding keeps following visible
  const focusActive = $derived(visible && presentation?.status !== 'dismissing');

  // Entrance motion must not delay accepted user intent. Exit shells remain inert.
  const interactionsEnabled = $derived(
    visible && (!presentation || presentation.status === 'presenting' || presentation.status === 'presented')
  );

  // ============================================================================
  // Animation Integration
  // ============================================================================

  let modalContentElement: HTMLElement | undefined = $state();
  // Read only under untrack in the status effect: binding it never re-runs that effect (or restarts a spring).
  let overlayContainer: HTMLElement | undefined = $state();
  let modalBackdropElement: HTMLElement | undefined = $state();

  // The (status, content) pair this effect last acted on.
  //
  // Not $state: the effect below reads and writes it, and a reactive guard would
  // re-trigger the effect it lives in (effect_update_depth_exceeded).
  //
  // Keyed on the *pair*, not on "have I animated anything yet". Those two
  // questions only diverge when the component mounts already `presented` — SSR
  // hydration of a page rendered with this overlay open — and the difference is
  // a permanent deadlock: the collapse branch is refused, `dismissalCompleted`
  // never fires, and a reducer waiting for that completion cannot finish teardown.
  // Entrance itself must not prevent the managed dismissal request.
  let lastAnimated: { status: string; content: unknown } | null = null;

  // Bound content removed while the same 'presenting' or 'dismissing' pair stays live settles
  // that transition once: `lastAnimated` marks the pair, then the matching callback is notified.
  const removedContentSettlement = createRemovedContentDismissal();

  // Watch presentation status and trigger animations
  // The bound instance's roles are known while mounted (an explicit close captures them before its commit).
  // Pre-render checkpoint: the committed status is read before the destructive render (default-plan sources).
  $effect(() => registerOverlayProbe(motion, () => presentation?.status));
  $effect(() => noteOverlayRoles(overlayContainer, { backdrop: modalBackdropElement, content: modalContentElement }));
  $effect(() => {
    // Retire a completed marker even when idle/cleared content cannot reach the backdrop-dependent animation branch.
    if (!presentation || presentation.status === 'idle') lastAnimated = null;
    if (!presentation || !modalContentElement) {
      return removedContentSettlement.contentLost(presentation, lastAnimated, (pair) => {
        lastAnimated = pair;
        if (pair.status === 'presenting') onPresentationComplete?.();
        else onDismissalComplete?.();
      });
    }
    removedContentSettlement.contentBound(presentation);
    if (!modalBackdropElement) return;

    // Only animate if content changed and we're in the right state
    if (presentation.status === 'idle') {
      return;
    }

    const { status, content } = presentation;
    if (lastAnimated?.status === status && lastAnimated.content === content) return;
    lastAnimated = { status, content };
    if (status !== 'presenting' && status !== 'dismissing') return;
    const owner = new AbortController();
    let completed = false;

    // An engine may take over this accepted transition's visuals (never its acceptance): no spring then.
    const cancelMotion = untrack(() => claimPresentationMotion(motion, overlayContainer, status, { backdrop: modalBackdropElement, content: modalContentElement }, () => {
      if (owner.signal.aborted) return;
      completed = true;
      if (status === 'presenting') onPresentationComplete?.();
      else onDismissalComplete?.();
    }));
    if (cancelMotion) {
      return () => {
        owner.abort();
        cancelMotion('superseded');
        if (!completed) lastAnimated = null;
      };
    }

    if (status === 'presenting') {
      // Animate in: content + backdrop in parallel
      Promise.all([
        animateModalIn(modalContentElement, springConfig, owner.signal),
        animateBackdropIn(modalBackdropElement, owner.signal)
      ]).then(() => {
        // Schedule callback outside of effect context
        queueMicrotask(() => {
          if (owner.signal.aborted) return;
          completed = true;
          onPresentationComplete?.();
        });
      });
    }

    if (status === 'dismissing') {
      // Animate out: content + backdrop in parallel
      Promise.all([
        animateModalOut(modalContentElement, springConfig, owner.signal),
        animateBackdropOut(modalBackdropElement, owner.signal)
      ]).then(() => {
        // Schedule callback outside of effect context
        queueMicrotask(() => {
          if (owner.signal.aborted) return;
          completed = true;
          onDismissalComplete?.();
        });
      });
    }
    return () => {
      owner.abort();
      // A cancelled attempt must be restartable even when the logical pair is unchanged.
      if (!completed) lastAnimated = null;
    };
  });

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function presentationLayer(node: HTMLElement, layer: { view: PresentationView<unknown, unknown> | undefined; focusActive: boolean }) {
    function dismissal(view: PresentationView<unknown, unknown> | undefined) {
      return Object.freeze({
        identity: () => view,
        onPointerOutside: () => {
          if (!disableClickOutside && view && interactionsEnabled) {
            try {
              view.dismiss();
            } catch (error) {
              console.error('[ModalPrimitive] Failed to dismiss:', error);
            }
          }
        },
        onEscape: (event: KeyboardEvent) => {
          if (event.key === 'Escape' && !disableEscapeKey && view && interactionsEnabled) {
            event.preventDefault();
            try {
              view.dismiss();
            } catch (error) {
              console.error('[ModalPrimitive] Failed to dismiss:', error);
            }
          }
        }
      });
    }

    let currentView = layer.view;
    const initialDismissal = dismissal(currentView);
    const handle = registerDismissalLayer.enroll({
      node,
      ...initialDismissal,
      focusActive: layer.focusActive,
      pointerBoundary: () => modalContentElement,
      pointerEnabled: () => visible,
      escapeEnabled: () => visible,
      focus: { node, modal: true, returnFocus: () => returnFocusTo }
    });

    return {
      update(next: { view: PresentationView<unknown, unknown> | undefined; focusActive: boolean }) {
        if (next.view !== currentView) {
          handle.replaceDismissal(dismissal(next.view));
          currentView = next.view;
        }
        handle.setFocusActive(next.focusActive);
        handle.refresh();
      },
      destroy() {
        handle.release();
        currentView = undefined;
      }
    };
  }

  let releaseContent: (() => void) | undefined;
  function bindContent(node: HTMLElement) {
    releaseContent?.();
    modalContentElement = node;
    let disposed = false;
    const destroy = () => {
      if (disposed) return;
      disposed = true;
      if (releaseContent === destroy) {
        releaseContent = undefined;
        modalContentElement = undefined;
      }
    };
    releaseContent = destroy;
    return { destroy };
  }
  onDestroy(() => releaseContent?.());

</script>

<!-- ============================================================================ -->
<!-- Keyboard Listeners -->
<!-- ============================================================================ -->



<!-- ============================================================================ -->
<!-- Portal Content -->
<!-- ============================================================================ -->

{#if visible}
  <div use:portal use:overlayLayer>
    <!-- Content Container -->
    <div
      use:documentScrollLock={visible}
      bind:this={overlayContainer}
      use:overlayInstance={motion}
      use:presentationLayer={{ view: admittedStore, focusActive }}
      style:pointer-events={interactionsEnabled ? 'auto' : 'none'}
    >
      {@render children?.({
        visible,
        store: admittedStore,
        bindBackdrop: (node: HTMLElement) => { modalBackdropElement = node; },
        bindContent,
        initialOpacity: presentation?.status === 'presenting' ? '0' : undefined
      })}
    </div>
  </div>
{/if}
