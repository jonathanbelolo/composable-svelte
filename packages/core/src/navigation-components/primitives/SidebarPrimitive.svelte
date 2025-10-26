<script lang="ts">
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

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
    disableEscapeKey = false,
    side = 'left',
    width = '240px',
    children
  }: SidebarPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  const visible = $derived(store !== null);

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
<!-- Inline Content (no portal) -->
<!-- ============================================================================ -->

{#if visible}
  {@render children?.({ visible, store, side, width })}
{/if}
