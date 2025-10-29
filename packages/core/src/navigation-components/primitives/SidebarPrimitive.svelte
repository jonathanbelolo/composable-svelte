<script lang="ts">
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import {
    animateSidebarExpand,
    animateSidebarCollapse
  } from '../../animation/animate.js';

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
  // Animation Integration
  // ============================================================================

  let contentElement: HTMLElement | undefined = $state();

  // Track last animated content to prevent duplicate animations
  // Initialize based on initial presentation state to handle starting in 'presented'
  let lastAnimatedContent: any = $state(
    presentation?.status === 'presented' ? presentation.content : null
  );

  // Set initial width when element is bound
  $effect(() => {
    if (!contentElement) return;

    // Set initial width based on presentation state
    if (presentation && presentation.status === 'presented') {
      contentElement.style.width = width;
    } else if (!presentation || presentation.status === 'idle') {
      contentElement.style.width = '0px';
    }
  });

  // Watch presentation status and trigger animations
  $effect(() => {
    if (!presentation || !contentElement) return;

    const currentContent = presentation.content;

    if (
      presentation.status === 'presenting' &&
      lastAnimatedContent !== currentContent
    ) {
      lastAnimatedContent = currentContent;
      console.log('[SidebarPrimitive] Starting presentation animation for', currentContent);
      animateSidebarExpand(contentElement, width, springConfig).then(() => {
        console.log('[SidebarPrimitive] Animation completed, calling onPresentationComplete');
        queueMicrotask(() => onPresentationComplete?.());
      });
    }

    if (presentation.status === 'dismissing' && lastAnimatedContent !== null) {
      lastAnimatedContent = null;
      console.log('[SidebarPrimitive] Starting dismissal animation');
      animateSidebarCollapse(contentElement, width, springConfig).then(() => {
        console.log('[SidebarPrimitive] Dismissal animation completed, calling onDismissalComplete');
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
