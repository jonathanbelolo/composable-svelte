/** Explicit-source preference access shared by ambient helpers and managed documents. */
const QUERY = '(prefers-reduced-motion: reduce)';
export type MotionMediaSource = { matchMedia(query: string): MediaQueryList } | null | undefined;
type Diagnostic = (error: unknown) => unknown;

const reportAmbientMotionPreferenceError: Diagnostic = (error) =>
  console.error('[Composable Svelte] Reduced-motion preference error:', error);

/** @internal Diagnostics never own preference delivery or cleanup. */
export function reportMotionPreferenceError(onError: Diagnostic | undefined, error: unknown): void {
  try { void Promise.resolve(onError?.(error)).catch(() => {}); } catch { /* contained */ }
}

/** @internal One query, with optional transactional listener acquisition. */
export function connectMotionPreference(
  source: MotionMediaSource,
  onChange?: ((reduced: boolean) => unknown) | undefined,
  onError?: Diagnostic | undefined
): { readonly reduced: boolean; dispose(): void } | undefined {
  let media: MediaQueryList | undefined;
  let live = false;
  let acquired = false;
  const report = (error: unknown) => reportMotionPreferenceError(onError, error);
  const listener = () => {
    if (!live) return;
    try { void Promise.resolve(onChange?.(Boolean(media!.matches))).catch(report); }
    catch (error) { report(error); }
  };
  const dispose = () => {
    live = false;
    if (!acquired) return;
    acquired = false;
    try { media!.removeEventListener('change', listener); } catch (error) { report(error); }
  };
  try {
    if (!source || typeof source.matchMedia !== 'function') return undefined;
    media = source.matchMedia(QUERY);
    if (!media) return undefined;
    if (onChange) {
      if (typeof media.addEventListener !== 'function' || typeof media.removeEventListener !== 'function') return undefined;
      // Mark provisional ownership before acquisition: even a partially throwing
      // implementation must be asked to remove this exact listener.
      acquired = true;
      media.addEventListener('change', listener);
    }
    // Read after acquisition to include changes that happened during registration.
    const reduced = Boolean(media.matches);
    live = true;
    return { reduced, dispose };
  } catch (error) { dispose(); report(error); return undefined; }
}

/** @internal Read without allocating a listener. */
export function prefersReducedMotionIn(source: MotionMediaSource, onError?: Diagnostic): boolean {
  return connectMotionPreference(source, undefined, onError)?.reduced ?? false;
}

/** @internal Public ambient watcher retains its change-only delivery contract. */
export function watchReducedMotionIn(source: MotionMediaSource, onChange: (reduced: boolean) => void, onError?: Diagnostic): () => void {
  return connectMotionPreference(source, onChange, onError)?.dispose ?? (() => {});
}

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
	return prefersReducedMotionIn(
		typeof window === 'undefined' ? undefined : window,
		reportAmbientMotionPreferenceError
	);
}

/**
 * Call `onChange` whenever the preference changes, and return a cleanup.
 *
 * For the store-owned case: a reducer that branches on the preference needs to
 * be told when it changes, not merely asked once.
 */
export function watchReducedMotion(onChange: (reduced: boolean) => void): () => void {
	return watchReducedMotionIn(
		typeof window === 'undefined' ? undefined : window,
		onChange,
		reportAmbientMotionPreferenceError
	);
}
