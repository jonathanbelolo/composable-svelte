<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import { animateSidebarExpand, animateSidebarCollapse } from '../../animation/animate.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SidebarPrimitiveProps<State, Action> {
    /**
     * Scoped store for the sidebar content.
     * When null, sidebar is hidden. When non-null, sidebar is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;

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
          store: ScopedDestinationStore<State, Action> | null;
          side: 'left' | 'right';
          width: string;
          bindContent: (node: HTMLElement) => void;
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
    disableEscapeKey = false,
    side = 'left',
    width = '240px',
    children
  }: SidebarPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  // Visible when store is non-null OR presentation is not idle
  const visible = $derived(
    (store !== null && store.state !== null) ||
      (presentation?.status !== 'idle' && presentation?.status !== undefined)
  );

  // Only allow interactions when fully presented or no animation system
  const interactionsEnabled = $derived(
    presentation ? presentation.status === 'presented' : (store !== null)
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

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && store) {
      event.preventDefault();
      try {
        store.dismiss();
      } catch (error) {
        console.error('[SidebarPrimitive] Failed to dismiss:', error);
      }
    }
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

<svelte:window on:keydown={handleEscape} />

<!-- ============================================================================ -->
<!-- Inline Content (no portal, always in DOM for animation) -->
<!-- ============================================================================ -->

<div style:pointer-events={interactionsEnabled ? 'auto' : 'none'}>
  {@render children?.({
    visible,
    store,
    side,
    width,
    bindContent: (node: HTMLElement) => { contentElement = node; }
  })}
</div>
