<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface NavigationStackPrimitiveProps<State, Action> {
    /**
     * Scoped store for the stack content.
     * When null, stack is hidden. When non-null, stack is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;

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
          store: ScopedDestinationStore<State, Action> | null;
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

  const visible = $derived(store !== null && stack.length > 0);
  const currentScreen = $derived(stack[stack.length - 1]);
  // The screen a pop returns to — the animated stack renders it as the outgoing layer.
  const previousScreen = $derived(stack[stack.length - 2]);
  const canGoBack = $derived(stack.length > 1);

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && canGoBack && onBack) {
      event.preventDefault();
      try {
        onBack();
      } catch (error) {
        console.error('[NavigationStackPrimitive] Failed to go back:', error);
      }
    }
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

<svelte:window on:keydown={handleEscape} />

<!-- ============================================================================ -->
<!-- Inline Content (no portal) -->
<!-- ============================================================================ -->

{#if visible}
  {@render children?.({ visible, store, stack, currentScreen, previousScreen, canGoBack, onBack })}
{/if}
