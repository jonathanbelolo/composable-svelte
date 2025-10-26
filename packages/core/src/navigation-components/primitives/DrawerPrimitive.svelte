<script lang="ts">
  import { portal } from '../../lib/actions/portal.js';
  import { clickOutside } from '../../lib/actions/clickOutside.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface DrawerPrimitiveProps<State, Action> {
    /**
     * Scoped store for the drawer content.
     * When null, drawer is hidden. When non-null, drawer is visible.
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
     * Side from which the drawer slides in.
     * @default 'left'
     */
    side?: 'left' | 'right';

    /**
     * Width of the drawer as CSS value.
     * @default '320px'
     */
    width?: string;
  }

  let {
    store,
    disableClickOutside = false,
    disableEscapeKey = false,
    side = 'left',
    width = '320px',
    children
  }: DrawerPrimitiveProps<unknown, unknown> = $props();

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
        console.error('[DrawerPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store) {
      try {
        store.dismiss();
      } catch (error) {
        console.error('[DrawerPrimitive] Failed to dismiss:', error);
      }
    }
  }

  // ============================================================================
  // Side Effects
  // ============================================================================

  // Prevent body scroll when drawer is open
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
      {@render children?.({ visible, store, side, width })}
    </div>
  </div>
{/if}
