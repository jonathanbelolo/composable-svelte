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

interface Layer {
	node: HTMLElement;
	isEnabled: () => boolean;
}

/**
 * Every participating dismissable layer, in mount order — the last is topmost.
 *
 * Overlays render through a portal, so a nested overlay is not a DOM descendant
 * of its parent. Without this stack the parent's `node.contains(target)` check
 * reports "outside" for a click inside its own child, and dismissing the child
 * also dismisses the parent.
 */
const layers: Layer[] = [];

export function clickOutside(
	node: HTMLElement,
	param: ClickOutsideHandler | ClickOutsideOptions
) {
	const handler = typeof param === 'function' ? param : param.handler;
	const isEnabled = typeof param === 'function' ? () => true : (param.enabled ?? (() => true));

	const layer: Layer = { node, isEnabled };
	layers.push(layer);

	const pointerDownListener = (event: PointerEvent) => {
		// Ignore right-clicks and middle-clicks
		if (event.button !== 0) return;

		if (!isEnabled()) return;

		// Only the topmost *participating* layer reacts, so a click never
		// dismisses a parent overlay out from under its own child. A layer that
		// has opted out is skipped rather than blocking the ones below it.
		for (let i = layers.length - 1; i >= 0; i--) {
			const candidate = layers[i];
			if (!candidate || !candidate.isEnabled()) continue;
			if (candidate !== layer) return;
			break;
		}

		const target = event.target as Node;
		if (node.contains(target)) return;

		// Deliberately no "is the target inside another layer?" test. Only the
		// topmost participating layer gets here, so a click on a layer *below* —
		// the modal behind an open dropdown — is a genuine outside click.
		//
		// The containment test must run synchronously: the click that closes a
		// nested overlay unmounts it, and by the next tick the target is detached
		// and `contains` would report "outside" for everything.
		//
		// Only the handler is deferred, to avoid conflicting with the `click`
		// event that follows this `pointerdown`.
		setTimeout(() => handler(event), 0);
	};

	// Use pointerdown for better mobile support
	document.addEventListener('pointerdown', pointerDownListener, true);

	return {
		destroy() {
			const index = layers.indexOf(layer);
			if (index !== -1) layers.splice(index, 1);
			document.removeEventListener('pointerdown', pointerDownListener, true);
		}
	};
}
