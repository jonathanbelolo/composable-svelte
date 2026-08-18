<script lang="ts">
  import type { Snippet } from 'svelte';
  import SidebarPrimitive from './primitives/SidebarPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface SidebarProps<State, Action> {
    /**
     * Scoped store for the sidebar content.
     */
    store: ScopedDestinationStore<State, Action> | null;

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
          store: ScopedDestinationStore<State, Action> | null;
          side: 'left' | 'right';
          width: string;
        }
      ]
    >;
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
  {store}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableEscapeKey}
  {side}
  {width}
>
  {#snippet children({ visible, store, side, width, targetWidth, bindContent, onTransitionEnd })}
    {#if visible && store}
      <!-- Outer wrapper: animates width with overflow hidden -->
      <div
        use:bindContent
        class="h-full transition-[width] duration-300 ease-out overflow-hidden"
        style="width: {targetWidth}"
        ontransitionend={onTransitionEnd}
      >
        <!-- Inner content: stays at full width, gets clipped -->
        <nav
          class={contentClasses}
          style="width: {width}; height: 100%"
          aria-label="Sidebar navigation"
        >
          {@render renderContent?.({ visible, store, side, width })}
        </nav>
      </div>
    {/if}
  {/snippet}
</SidebarPrimitive>
