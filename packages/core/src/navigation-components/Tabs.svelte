<script lang="ts">
  import TabsPrimitive from './primitives/TabsPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '../lib/utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface TabsProps<State, Action> {
    /**
     * Scoped store for the tabs content.
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

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;

    /**
     * Override tab list container classes.
     */
    tabListClass?: string;

    /**
     * Override individual tab button classes.
     */
    tabClass?: string;

    /**
     * Override content container classes.
     */
    class?: string;
  }

  let {
    store,
    tabs,
    activeTab,
    onTabChange,
    unstyled = false,
    tabListClass,
    tabClass,
    class: className,
    children
  }: TabsProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultTabListClasses = 'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground';
  const defaultTabClasses = 'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';
  const defaultActiveTabClasses = 'bg-background text-foreground shadow-sm';
  const defaultContentClasses = 'mt-2';

  const tabListClasses = $derived(
    unstyled ? '' : cn(defaultTabListClasses, tabListClass)
  );

  const getTabClasses = (isActive: boolean) =>
    unstyled
      ? ''
      : cn(
          defaultTabClasses,
          isActive && defaultActiveTabClasses,
          tabClass
        );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // ============================================================================
  // Keyboard Navigation
  // ============================================================================

  function handleKeyDown(event: KeyboardEvent, currentIndex: number) {
    let newIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        newIndex = (currentIndex + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        event.preventDefault();
        newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = tabs.length - 1;
        break;
    }

    if (newIndex !== null) {
      onTabChange(newIndex);
      // Focus the newly selected tab
      setTimeout(() => {
        document.getElementById(`tab-${newIndex}`)?.focus();
      }, 0);
    }
  }

  // Note: No transitions/animations in Phase 2 - instant tab switching only
</script>

<!-- ============================================================================ -->
<!-- Styled Tabs -->
<!-- ============================================================================ -->

<TabsPrimitive {store} {tabs} {activeTab} {onTabChange}>
  {#snippet children({ visible, store, tabs, activeTab, onTabChange })}
    <div role="tablist" aria-label="Tabs" class={tabListClasses}>
      {#each tabs as tab, index}
        <button
          role="tab"
          aria-selected={activeTab === index}
          aria-controls="tabpanel-{index}"
          id="tab-{index}"
          class={getTabClasses(activeTab === index)}
          tabindex={activeTab === index ? 0 : -1}
          onclick={() => onTabChange(index)}
          onkeydown={(e) => handleKeyDown(e, index)}
        >
          {tab}
        </button>
      {/each}
    </div>

    <div
      role="tabpanel"
      id="tabpanel-{activeTab}"
      aria-labelledby="tab-{activeTab}"
      tabindex="0"
      class={contentClasses}
    >
      {@render children?.({ visible, store, tabs, activeTab, onTabChange })}
    </div>
  {/snippet}
</TabsPrimitive>
