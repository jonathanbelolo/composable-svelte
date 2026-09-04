/**
 * The overlay primitives lock body scroll by writing `document.body.style`,
 * which is shared by every test in a worker. A lock leaked by one test made
 * four "prevents body scroll" tests pass without their component doing
 * anything. Reset before asserting, and after every test in a file that
 * mounts an overlay.
 */

import { afterEach } from 'vitest';

export function resetBodyScroll(): void {
	document.body.style.overflow = '';
	document.body.style.paddingRight = '';
}

/** Call once at file scope. */
export function resetBodyScrollAfterEach(): void {
	afterEach(resetBodyScroll);
}
