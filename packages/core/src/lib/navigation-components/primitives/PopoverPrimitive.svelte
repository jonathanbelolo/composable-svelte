<script lang="ts">
  import type { Snippet } from 'svelte';
  import { portal } from '../../actions/portal.js';
  import { clickOutside } from '../../actions/clickOutside.js';
  import { focusTrap } from '../../actions/focusTrap.js';
  import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
  import type { PresentationState } from '../../navigation/types.js';
  import type { SpringConfig } from '../../animation/spring-config.js';
  import {
    animatePopoverIn,
    animatePopoverOut
  } from '../../animation/animate.js';

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
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any> | undefined;

    /**
     * Callback when presentation animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'presentationCompleted' } }
     */
    onPresentationComplete?: (() => void) | undefined;

    /**
     * Callback when dismissal animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'dismissalCompleted' } }
     */
    onDismissalComplete?: (() => void) | undefined;

    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig> | undefined;

    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean | undefined;

    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean | undefined;

    /**
     * Element to return focus to when popover is dismissed.
     * @default null
     */
    returnFocusTo?: HTMLElement | null | undefined;

    /**
     * Content snippet. Receives the primitive's render state.
     */
    children?: Snippet<
      [
        {
          visible: boolean;
          store: ScopedDestinationStore<State, Action> | null;
          bindContent: (node: HTMLElement, transform?: string) => void;
          initialOpacity: string | undefined;
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
    disableClickOutside = false,
    disableEscapeKey = false,
    returnFocusTo = null,
    children
  }: PopoverPrimitiveProps<unknown, unknown> = $props();

  // ============================================================================
  // Derived State
  // ============================================================================

  // Visible when store is non-null OR presentation is not idle
  // This ensures popover stays mounted during 'dismissing' state for exit animation
  const visible = $derived(
    (store !== null && store.state !== null) ||
      (presentation?.status !== 'idle' && presentation?.status !== undefined)
  );

  // Only allow interactions when fully presented
  const interactionsEnabled = $derived(
    presentation ? presentation.status === 'presented' : visible
  );

  // ============================================================================
  // Animation Integration
  // ============================================================================

  let contentElement: HTMLElement | undefined = $state();
  let positionTransform: string = $state('');


  // The (status, content) pair this effect last acted on.
  //
  // Not $state: the effect below reads and writes it, and a reactive guard would
  // re-trigger the effect it lives in (effect_update_depth_exceeded).
  //
  // Keyed on the *pair*, not on "have I animated anything yet". Those two
  // questions only diverge when the component mounts already `presented` — SSR
  // hydration of a page rendered with this overlay open — and the difference is
  // a permanent deadlock: the collapse branch is refused, `dismissalCompleted`
  // never fires, and the reducer's own `status !== 'presented'` guard then
  // rejects every further dismiss.
  let lastAnimated: { status: string; content: unknown } | null = null;

  // Watch presentation status and trigger animations
  $effect(() => {
    if (!presentation || !contentElement) return;

    if (presentation.status === 'idle') {
      lastAnimated = null;
      return;
    }

    const { status, content } = presentation;
    if (lastAnimated?.status === status && lastAnimated.content === content) return;
    lastAnimated = { status, content };

    if (status === 'presenting') {
      animatePopoverIn(contentElement, positionTransform, springConfig).then(() => {
        queueMicrotask(() => onPresentationComplete?.());
      });
    }

    if (status === 'dismissing') {
      animatePopoverOut(contentElement, positionTransform, springConfig).then(() => {
        queueMicrotask(() => onDismissalComplete?.());
      });
    }
  });

  // ============================================================================
  // Event Handlers
  // ============================================================================

  function handleEscape(event: KeyboardEvent) {
    if (event.key === 'Escape' && !disableEscapeKey && store && interactionsEnabled) {
      event.preventDefault();
      try {
        store.dismiss();
      } catch (error) {
        console.error('[PopoverPrimitive] Failed to dismiss:', error);
      }
    }
  }

  function handleClickOutside() {
    if (!disableClickOutside && store && interactionsEnabled) {
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
      use:clickOutside={{ handler: handleClickOutside, enabled: () => !disableClickOutside }}
      use:focusTrap={{ returnFocus: returnFocusTo }}
      style:pointer-events={interactionsEnabled ? 'auto' : 'none'}
    >
      {@render children?.({
        visible,
        store,
        bindContent: (node: HTMLElement, transform: string = '') => {
          contentElement = node;
          positionTransform = transform;
        },
        initialOpacity: presentation?.status === 'presenting' ? '0' : undefined
      })}
    </div>
  </div>
{/if}
