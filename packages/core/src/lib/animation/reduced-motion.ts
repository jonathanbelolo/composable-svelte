/**
 * Read the user's motion preference.
 *
 * `guides/ANIMATION-GUIDELINES.md` requires every animation to be skippable, and
 * records that not one of the helpers in `animate.ts` consults this. That is a
 * gap this file does not close on its own — it provides the reader, not the
 * plumbing. It exists because the scroll follower is the first animation written
 * after the rule, and honouring it there cost three lines.
 *
 * @packageDocumentation
 */

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Whether the user has asked for reduced motion.
 *
 * Returns `false` where the question cannot be asked — during server rendering,
 * or in an environment without `matchMedia`. That is the safe direction: it
 * means "animate", which is what the code did before this existed, rather than
 * silently disabling animation everywhere the check is unavailable.
 *
 * Read it at the point of use rather than caching it. The preference can change
 * while the page is open, and a value captured at module load would be stale for
 * the life of the session.
 */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return false;
	}
	return window.matchMedia(QUERY).matches;
}

/**
 * Call `onChange` whenever the preference changes, and return a cleanup.
 *
 * For the store-owned case: a reducer that branches on the preference needs to
 * be told when it changes, not merely asked once.
 */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
		return () => {};
	}

	const media = window.matchMedia(QUERY);
	const listener = (event: MediaQueryListEvent) => onChange(event.matches);
	media.addEventListener('change', listener);
	return () => media.removeEventListener('change', listener);
}
