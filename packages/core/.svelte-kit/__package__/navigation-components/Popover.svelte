<script lang="ts">
  import PopoverPrimitive from './primitives/PopoverPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import type { PresentationState } from '../navigation/types.js';
  import type { SpringConfig } from '../animation/spring-config.js';
  import { cn } from '../utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface PopoverProps<State, Action> {
    /**
     * Scoped store for the popover content.
     */
    store: ScopedDestinationStore<State, Action> | null;

    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any>;

    /**
     * Callback when presentation animation completes.
     */
    onPresentationComplete?: () => void;

    /**
     * Callback when dismissal animation completes.
     */
    onDismissalComplete?: () => void;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig>;

    /**
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean;

    /**
     * Override content container classes.
     */
    class?: string;

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
     * Custom positioning style.
     * User must provide absolute positioning via inline styles or classes.
     */
    style?: string;
  }

  let {
    store,
    presentation,
    onPresentationComplete,
    onDismissalComplete,
    springConfig,
    unstyled = false,
    class: className,
    disableClickOutside = false,
    disableEscapeKey = false,
    style = '',
    children
  }: PopoverProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes and Styles
  // ============================================================================

  const defaultContentClasses =
    'absolute z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none';

  const contentClasses = $derived(
    unstyled ? '' : cn(defaultContentClasses, className)
  );

  // Extract transform from style string and separate it for animation
  const extractedStyles = $derived(() => {
    if (!style) return { styleWithoutTransform: '', transform: '' };

    // Match transform property in the style string
    const transformMatch = style.match(/transform:\s*([^;]+)/);
    const transform = transformMatch ? transformMatch[1].trim() : '';

    // Remove transform from the style string
    const styleWithoutTransform = style.replace(/transform:\s*[^;]+;?\s*/, '').trim();

    return { styleWithoutTransform, transform };
  });
</script>

<!-- ============================================================================ -->
<!-- Styled Popover -->
<!-- ============================================================================ -->

<PopoverPrimitive
  {store}
  {presentation}
  {onPresentationComplete}
  {onDismissalComplete}
  {springConfig}
  {disableClickOutside}
  {disableEscapeKey}
>
  {#snippet children({ visible, store, bindContent, initialOpacity })}
    <div
      use:bindContent={[extractedStyles().transform]}
      class={contentClasses}
      style="{extractedStyles().styleWithoutTransform}{initialOpacity ? `; opacity: ${initialOpacity}` : ''}"
      role="dialog"
      aria-modal="false"
    >
      {@render children?.({ visible, store })}
    </div>
  {/snippet}
</PopoverPrimitive>
