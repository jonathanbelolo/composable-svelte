<script lang="ts">
  import type { Snippet } from 'svelte';
  import SidebarPrimitive from './primitives/SidebarPrimitive.svelte';
  import { assertPresentationView, type PresentationView } from '../navigation/managed-integration.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SidebarProps<State, Action> {
    /**
     * Managed presentation view for the sidebar content.
     */
    store?: PresentationView<State, Action> | undefined;

    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any> | undefined;

    /**
     * Callback when presentation animation completes.
     */
    onPresentationComplete?: (() => void) | undefined;

    /**
     * Callback when dismissal animation completes.
     */
    onDismissalComplete?: (() => void) | undefined;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig> | undefined;

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean | undefined;

    /**
     * Override content container classes.
     */
    class?: string | undefined;

    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean | undefined;

    /**
     * Side where the sidebar is positioned.
     * @default 'left'
     */
    side?: 'left' | 'right' | undefined;

    /**
     * Width of the sidebar as CSS value.
     * @default '240px'
     */
    width?: string | undefined;

    /**
     * Content snippet. Receives the render state of the presented layer.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: PresentationView<State, Action> | undefined;
          side: 'left' | 'right';
          width: string;
        }
      ]
    > | undefined;
  }

  let {
    store,
    presentation,
    onPresentationComplete,
    onDismissalComplete,
    springConfig,
    unstyled = false,
    class: className,
    disableEscapeKey = false,
    side = 'left',
    width = '240px',
    children: renderContent
  }: SidebarProps<unknown, unknown> = $props();

  const admittedStore = $derived.by(() => {
    if (store !== undefined) {
      assertPresentationView(store);
    }
    return store;
  });

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultContentClasses = $derived(
    side === 'left'
      ? 'h-full border-r bg-background overflow-hidden'
      : 'h-full border-l bg-background overflow-hidden'
  );

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Note: Animations integrated via PresentationState (state-driven, not CSS)
  // Note: Sidebar is inline (not fixed/absolute), meant for layout integration
</script>

<!-- ============================================================================ -->
<!-- Styled Sidebar -->
<!-- ============================================================================ -->

<SidebarPrimitive
  store={admittedStore}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableEscapeKey}
  {side}
  {width}
>
  {#snippet children({ visible, store: primitiveStore, side, width, bindContent })}
    {#if visible}
      <!-- Outer wrapper: Motion One animates its margin and transform. -->
      <div
        use:bindContent
        data-sidebar-wrapper
        class="h-full overflow-hidden"
        style="width: {width}"
      >
        <!-- Inner content: stays at full width, gets clipped -->
        <nav
          class={contentClasses}
          style="width: {width}; height: 100%"
          aria-label="Sidebar navigation"
        >
          {@render renderContent?.({ visible, store: primitiveStore, side, width })}
        </nav>
      </div>
    {/if}
  {/snippet}
</SidebarPrimitive>
