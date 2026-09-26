<script lang="ts">
  import { createDismissalBoundary } from '../../actions/dismissalBoundary.js';
  const registerDismissalLayer = createDismissalBoundary();
  import type { Snippet } from 'svelte';
  import { assertPresentationView, type PresentationView } from '../../navigation/managed-integration.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import { animateSidebarExpand, animateSidebarCollapse } from '../../animation/animate.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SidebarPrimitiveProps<State, Action> {
    /**
     * Managed presentation view for the sidebar content.
     * When undefined or retired, sidebar is hidden (unless presentation retains exit shell).
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
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean | undefined;

    /**
     * Side where the sidebar is positioned.
     * @default 'left'
     */
    side?: 'left' | 'right' | undefined;

    /**
     * Width of the sidebar as CSS value.
     * @default '240px'
     */
    width?: string | undefined;

    /**
     * Content snippet. Receives the primitive's render state.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: PresentationView<State, Action> | undefined;
          side: 'left' | 'right';
          width: string;
          bindContent: (node: HTMLElement) => void;
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
    disableEscapeKey = false,
    side = 'left',
    width = '240px',
    children
  }: SidebarPrimitiveProps<unknown, unknown> = $props();

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
  const visible = $derived(
    (admittedStore !== undefined && admittedStore.state !== undefined) ||
      (presentation?.status !== 'idle' && presentation?.status !== undefined)
  );

  // Entrance motion must not delay accepted user intent. Exit shells remain inert.
  const interactionsEnabled = $derived(
    visible && (!presentation || presentation.status === 'presenting' || presentation.status === 'presented')
  );

  // ============================================================================
  // Animation Integration
  // ============================================================================

  let contentElement: HTMLElement | undefined = $state();

  // The (status, content) pair this effect last acted on.
  //
  // Not $state: the effect below reads and writes it, and a reactive guard would
  // re-trigger the effect it lives in (effect_update_depth_exceeded).
  //
  // Keyed on the *pair*, not on "have I animated anything yet". A sidebar is
  // routinely mounted already `presented` — that is what persistent desktop
  // navigation looks like, and SidebarDemo does exactly that — and a guard that
  // only remembers a prior presentation refuses the first collapse, so
  // `onDismissalComplete` never fires and the sidebar sticks in `dismissing`
  // forever. Recording `presented` at mount without animating is what lets the
  // dismissal through.
  let lastAnimated: { status: string; content: unknown } | null = null;

  // Watch presentation status and drive Motion One. This replaces a CSS
  // `transition-[width]` + `transitionend` handshake that could never complete:
  // the wrapper is only mounted once `visible` is already true, so it was born
  // at its target width, no transition ever ran, and `presenting` never advanced
  // to `presented`.
  $effect(() => {
    if (!presentation || !contentElement) return;

    if (presentation.status === 'idle') {
      lastAnimated = null;
      return;
    }

    const { status, content } = presentation;
    if (lastAnimated?.status === status && lastAnimated.content === content) return;
    lastAnimated = { status, content };

    if (status === 'presenting') {
      animateSidebarExpand(contentElement, width, springConfig, side).then(() => {
        queueMicrotask(() => onPresentationComplete?.());
      });
    } else if (status === 'dismissing') {
      animateSidebarCollapse(contentElement, width, springConfig, side).then(() => {
        queueMicrotask(() => onDismissalComplete?.());
      });
    }
  });

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function presentationLayer(
    node: HTMLElement,
    layer: { view: PresentationView<unknown, unknown> | undefined }
  ) {
    function dismissal(view: PresentationView<unknown, unknown> | undefined) {
      return Object.freeze({
        identity: () => view,
        onEscape: (event: KeyboardEvent) => {
          if (event.key === 'Escape' && !disableEscapeKey && view && interactionsEnabled) {
            event.preventDefault();
            try {
              view.dismiss();
            } catch (error) {
              console.error('[SidebarPrimitive] Failed to dismiss:', error);
            }
          }
        }
      });
    }

    let currentView = layer.view;
    const handle = registerDismissalLayer.enroll({
      node,
      ...dismissal(currentView),
      escapeEnabled: () => visible && interactionsEnabled && !disableEscapeKey && !!currentView
    });
    return {
      update(next: { view: PresentationView<unknown, unknown> | undefined }) {
        if (next.view !== currentView) {
          handle.replaceDismissal(dismissal(next.view));
          currentView = next.view;
        }
        handle.refresh();
      },
      destroy() {
        handle.release();
        currentView = undefined;
      }
    };
  }
  // Note: Sidebars are persistent desktop navigation
  // - No backdrop (content stays visible)
  // - No body scroll lock (sidebar coexists with page)
  // - No click-outside dismiss (persistent by design)
  // - No portal (rendered inline)
</script>

<!-- ============================================================================ -->
<!-- Keyboard Listeners -->
<!-- ============================================================================ -->



<!-- ============================================================================ -->
<!-- Inline Content (no portal, always in DOM for animation) -->
<!-- ============================================================================ -->

<div use:presentationLayer={{ view: admittedStore }} style:pointer-events={interactionsEnabled ? 'auto' : 'none'}>
  {@render children?.({
    visible,
    store: admittedStore,
    side,
    width,
    bindContent: (node: HTMLElement) => { contentElement = node; }
  })}
</div>
