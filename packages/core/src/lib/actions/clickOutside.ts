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
 */

/**
 * Every mounted dismissable layer, in mount order — the last entry is topmost.
 *
 * Overlays render through a portal, so a nested one (an alert opened from a
 * modal) is not a DOM descendant of its parent. Without this stack the parent's
 * `node.contains(target)` check reports "outside" for a click inside its own
 * child, and dismissing the child also dismisses the parent.
 */
const layers: HTMLElement[] = [];

export function clickOutside(node: HTMLElement, handler: (event: PointerEvent) => void) {
	layers.push(node);

	const pointerDownListener = (event: PointerEvent) => {
		// Ignore right-clicks and middle-clicks
		if (event.button !== 0) return;

		// Only the topmost layer reacts, so a click never dismisses a parent
		// overlay out from under its own child.
		if (layers[layers.length - 1] !== node) return;

		const target = event.target as Node;
		if (node.contains(target)) return;

		// Deliberately no "is the target inside some other layer?" test. Only the
		// topmost layer gets here, so nothing is stacked above it, and a click on
		// a layer *below* — the modal behind an open dropdown — is a genuine
		// outside click that should dismiss us.
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
			const index = layers.indexOf(node);
			if (index !== -1) layers.splice(index, 1);
			document.removeEventListener('pointerdown', pointerDownListener, true);
		}
	};
}
