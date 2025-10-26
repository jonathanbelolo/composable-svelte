<script lang="ts">
  import { portal } from '../../lib/actions/portal.js';
  import { clickOutside } from '../../lib/actions/clickOutside.js';
  import { focusTrap } from '../../lib/actions/focusTrap.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface PopoverPrimitiveProps<State, Action> {
    /**
     * Scoped store for the popover content.
     * When null, popover is hidden. When non-null, popover is visible.
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

    /**
     * Element to return focus to when popover is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
  }

  let {
    store,
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    children
  }: PopoverPrimitiveProps<unknown, unknown> = $props();

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
        console.error('[PopoverPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store) {
      try {
        store.dismiss();
      } catch (error) {
        console.error('[PopoverPrimitive] Failed to dismiss:', error);
      }
    }
  }

  // Note: Popovers typically don't prevent body scroll
  // as they're meant for contextual menus/tooltips
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
    <div
      use:clickOutside={handleClickOutside}
      use:focusTrap={{ returnFocus: returnFocusTo }}
    >
      {@render children?.({ visible, store })}
    </div>
  </div>
{/if}
