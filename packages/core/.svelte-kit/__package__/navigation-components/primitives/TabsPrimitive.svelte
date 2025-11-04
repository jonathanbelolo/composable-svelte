<script lang="ts">
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface TabsPrimitiveProps<State, Action> {
    /**
     * Scoped store for the tabs content.
     * When null, tabs are hidden. When non-null, tabs are visible.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Tab labels for rendering tab buttons.
     */
    tabs: string[];

    /**
     * Currently active tab index.
     */
    activeTab: number;

    /**
     * Callback when tab is clicked.
     */
    onTabChange: (index: number) => void;
  }

  let {
    store,
    tabs,
    activeTab,
    onTabChange,
    children
  }: TabsPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  const visible = $derived(store !== null);

  // Note: Tabs are inline navigation components
  // - No portal (rendered inline)
  // - No dismiss/escape (tabs switch via action)
  // - No body scroll lock (tabs are part of page flow)
</script>

<!-- ============================================================================ -->
<!-- Inline Content (no portal) -->
<!-- ============================================================================ -->

{#if visible}
  {@render children?.({ visible, store, tabs, activeTab, onTabChange })}
{/if}
