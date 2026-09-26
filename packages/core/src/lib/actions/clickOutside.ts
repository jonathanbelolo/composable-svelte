import { registerDismissalLayer } from './dismissalCoordinator.js';

/**
 * Detect clicks outside the given element and call handler.
 *
 * Adapted from Radix UI DismissableLayer for robust outside click detection.
 * Handles:
 * - Pointer events (mouse, touch, pen)
 * - Nested portals (clicks in other overlays)
 * - Browser default behaviors
 *
 * @example
 * ```svelte
 * <div use:clickOutside={handleClickOutside}>
 *   Content here
 * </div>
 * ```
 *
 * @example
 * ```svelte
 * <!-- Opt this layer out of dismissal without removing it from the DOM -->
 * <div use:clickOutside={{ handler, enabled: () => !disableClickOutside }}>
 *   Content here
 * </div>
 * ```
 */

export type ClickOutsideHandler = (event: PointerEvent) => void;

export interface ClickOutsideOptions {
	handler: ClickOutsideHandler;
	/**
	 * Whether this layer participates in outside-click dismissal at all.
	 *
	 * Consulted at event time. A layer that returns `false` is skipped entirely,
	 * so it neither dismisses itself nor shadows the layers beneath it — which
	 * is what an overlay configured with `disableClickOutside` needs.
	 */
	enabled?: () => boolean;
}

export function clickOutside(node: HTMLElement, param: ClickOutsideHandler | ClickOutsideOptions) {
 const options = typeof param === 'function' ? { handler: param } : param;
 const destroy = registerDismissalLayer({
  node,
  pointerEnabled: options.enabled ?? (() => true),
  onPointerOutside: options.handler
 });
 return { destroy };
}
