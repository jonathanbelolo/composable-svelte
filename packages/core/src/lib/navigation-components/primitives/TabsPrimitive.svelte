<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ChildView } from '../../navigation/managed-integration.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface TabsPrimitiveProps<State, Action> {
    /**
     * Scoped store for the tabs content.
     * Missing or retired views hide the tabs.
     */
    store: ChildView<State, Action> | undefined;

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

    /**
     * Content snippet. Receives the primitive's render state.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ChildView<State, Action> | undefined;
          tabs: string[];
          activeTab: number;
          onTabChange: (index: number) => void;
        }
      ]
    > | undefined;
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

  const visible = $derived(store !== undefined && store.state !== undefined);

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
