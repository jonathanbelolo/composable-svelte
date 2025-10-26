<script lang="ts">
  import { portal } from '../../lib/actions/portal.js';
  import { clickOutside } from '../../lib/actions/clickOutside.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface AlertPrimitiveProps<State, Action> {
    /**
     * Scoped store for the alert content.
     * When null, alert is hidden. When non-null, alert is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean;

    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;
  }

  let {
    store,
    disableClickOutside = false,
    disableEscapeKey = false,
    children
  }: AlertPrimitiveProps<unknown, unknown> = $props();

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
        console.error('[AlertPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store) {
      try {
        store.dismiss();
      } catch (error) {
        console.error('[AlertPrimitive] Failed to dismiss:', error);
      }
    }
  }

  // ============================================================================
  // Side Effects
  // ============================================================================

  // Prevent body scroll when alert is open
  $effect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      const originalPaddingRight = document.body.style.paddingRight;
      const scrollbarWidth =
        window.innerWidth - document.documentElement.clientWidth;

      document.body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        document.body.style.paddingRight = `${scrollbarWidth}px`;
      }

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.paddingRight = originalPaddingRight;
      };
    }
  });
</script>

<!-- ============================================================================ -->
<!-- Keyboard Listeners -->
<!-- ============================================================================ -->

<svelte:window on:keydown={handleEscape} />

<!-- ============================================================================ -->
<!-- Portal Content -->
<!-- ============================================================================ -->

{#if visible}
  <div use:portal>
    <div use:clickOutside={handleClickOutside}>
      {@render children?.({ visible, store })}
    </div>
  </div>
{/if}
