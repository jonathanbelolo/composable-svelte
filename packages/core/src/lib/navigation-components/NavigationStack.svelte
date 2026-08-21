<script lang="ts">
  import type { Snippet } from 'svelte';
  import NavigationStackPrimitive from './primitives/NavigationStackPrimitive.svelte';
  import type { ScopedDestinationStore } from '../navigation/scope-to-destination.js';
  import { cn } from '../utils.js';

  // ============================================================================
  // Props
  // ============================================================================

  interface NavigationStackProps<State, Action> {
    /**
     * Scoped store for the stack content.
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
     * Disable all default styling.
     * When true, component behaves like the primitive.
     * @default false
     */
    unstyled?: boolean | undefined;

    /**
     * Override container classes.
     */
    class?: string | undefined;

    /**
     * Override header classes.
     */
    headerClass?: string | undefined;

    /**
     * Override content classes.
     */
    contentClass?: string | undefined;

    /**
     * Show back button in header.
     * @default true
     */
    showBackButton?: boolean | undefined;

    /**
     * Content snippet. Receives the render state of the presented layer.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ScopedDestinationStore<State, Action> | null;
          currentScreen: State | undefined;
          canGoBack: boolean;
          onBack: (() => void) | undefined;
        }
      ]
    >;
  }

  let {
    store,
    stack,
    onBack,
    unstyled = false,
    class: className,
    headerClass,
    contentClass,
    showBackButton = true,
    children: renderContent
  }: NavigationStackProps<unknown, unknown> = $props();

  // ============================================================================
  // Computed Classes
  // ============================================================================

  const defaultContainerClasses = 'flex flex-col h-full';
  const defaultHeaderClasses = 'flex items-center border-b bg-background px-4 py-3';
  const defaultBackButtonClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 w-10';
  const defaultContentClasses = 'flex-1 overflow-auto';

  const containerClasses = $derived(
    unstyled ? '' : cn(defaultContainerClasses, className)
  );

  const headerClassNames = $derived(
    unstyled ? '' : cn(defaultHeaderClasses, headerClass)
  );

  const contentClassNames = $derived(
    unstyled ? '' : cn(defaultContentClasses, contentClass)
  );

  // Note: No transitions/animations in Phase 2 - instant screen transitions only
</script>

<!-- ============================================================================ -->
<!-- Styled NavigationStack -->
<!-- ============================================================================ -->

<NavigationStackPrimitive {store} {stack} {onBack}>
  {#snippet children({ visible, store, currentScreen, canGoBack, onBack })}
    <div class={containerClasses} role="navigation" aria-label="Navigation stack">
      {#if showBackButton && canGoBack}
        <header class={headerClassNames}>
          <button
            class={defaultBackButtonClasses}
            onclick={onBack}
            aria-label="Go back"
          >
            ←
          </button>
        </header>
      {/if}

      <div class={contentClassNames}>
        {@render renderContent?.({ visible, store, currentScreen, canGoBack, onBack })}
      </div>
    </div>
  {/snippet}
</NavigationStackPrimitive>
