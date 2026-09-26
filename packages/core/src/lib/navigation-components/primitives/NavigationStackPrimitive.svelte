<script lang="ts">
  import { createDismissalBoundary } from '../../actions/dismissalBoundary.js';
  const registerDismissalLayer = createDismissalBoundary();
  import type { Snippet } from 'svelte';
  import type { ChildView } from '../../navigation/managed-integration.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface NavigationStackPrimitiveProps<State, Action> {
    /**
     * Scoped store for the stack content.
     * Missing or retired views hide the stack.
     */
    store: ChildView<State, Action> | undefined;

    /**
     * Stack of screen states.
     */
    stack: readonly State[];

    /**
     * Callback to handle going back in the stack.
     */
    onBack?: (() => void) | undefined;

    /**
     * Content snippet. Receives the primitive's render state.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ChildView<State, Action> | undefined;
          stack: readonly State[];
          currentScreen: State | undefined;
          previousScreen: State | undefined;
          canGoBack: boolean;
          onBack: (() => void) | undefined;
        }
      ]
    > | undefined;
  }

  let {
    store,
    stack,
    onBack,
    children
  }: NavigationStackPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  const visible = $derived(
    store !== undefined && store.state !== undefined && stack.length > 0
  );
  const currentScreen = $derived(stack[stack.length - 1]);
  // The screen a pop returns to — the animated stack renders it as the outgoing layer.
  const previousScreen = $derived(stack[stack.length - 2]);
  const canGoBack = $derived(stack.length > 1);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && visible && canGoBack && onBack) {
      event.preventDefault();
      try {
        onBack();
      } catch (error) {
        console.error('[NavigationStackPrimitive] Failed to go back:', error);
      }
    }
  }

  function dismissal(node: HTMLElement) {
    return { destroy: registerDismissalLayer({ node, priority: 0,
      escapeEnabled: () => visible && canGoBack && !!onBack, onEscape: handleEscape }) };
  }
  // Note: NavigationStack is an inline navigation component
  // - No portal (rendered inline)
  // - Manages screen hierarchy (push/pop pattern)
  // - Supports Escape key to go back
  // - No body scroll lock (stack is part of page flow)
</script>

<!-- ============================================================================ -->
<!-- Keyboard Listeners -->
<!-- ============================================================================ -->



<!-- ============================================================================ -->
<!-- Inline Content (no portal) -->
<!-- ============================================================================ -->

{#if visible}
  <template use:dismissal></template>
  {@render children?.({ visible, store, stack, currentScreen, previousScreen, canGoBack, onBack })}
{/if}
