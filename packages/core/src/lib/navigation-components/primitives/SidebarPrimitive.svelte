<script lang="ts">
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';

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
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;

    /**
     * Side where the sidebar is positioned.
     * @default 'left'
     */
    side?: 'left' | 'right';

    /**
     * Width of the sidebar as CSS value.
     * @default '240px'
     */
    width?: string;
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
  // CSS Transition Integration
  // ============================================================================

  let contentElement: HTMLElement | undefined = $state();

  // Compute target width based on presentation state
  const targetWidth = $derived(() => {
    if (!presentation) return visible ? width : '0px';

    switch (presentation.status) {
      case 'presented':
      case 'presenting':
        return width;
      case 'dismissing':
      case 'idle':
      default:
        return '0px';
    }
  });

  // Handle transitionend event to trigger callbacks
  function handleTransitionEnd(event: TransitionEvent) {
    // Only handle width transitions on the content element itself
    if (event.target !== contentElement || event.propertyName !== 'width') {
      return;
    }

    if (!presentation) return;

    console.log('[SidebarPrimitive] Transition ended, status:', presentation.status);

    // Trigger appropriate callback based on current status
    if (presentation.status === 'presenting') {
      console.log('[SidebarPrimitive] Presentation complete');
      queueMicrotask(() => onPresentationComplete?.());
    } else if (presentation.status === 'dismissing') {
      console.log('[SidebarPrimitive] Dismissal complete');
      queueMicrotask(() => onDismissalComplete?.());
    }
  }

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
    targetWidth: targetWidth(),
    bindContent: (node: HTMLElement) => { contentElement = node; },
    onTransitionEnd: handleTransitionEnd
  })}
</div>
