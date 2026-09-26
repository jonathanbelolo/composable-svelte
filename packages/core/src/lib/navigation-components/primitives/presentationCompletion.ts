/**
 * Private completion seam for the presentation primitives.
 *
 * Not part of the public surface: import it only from sibling primitives and
 * never re-export it. The reducer-owned `presentation` stays the authority;
 * nothing here starts, extends, or replaces a presentation.
 *
 * @internal
 */

/** The slice of a presentation that an animation attempt is keyed on. */
type PresentationPair = { readonly status: string; readonly content?: unknown };

/** The statuses whose completion the animation effect owes the reducer. */
type TransitionalStatus = 'presenting' | 'dismissing';

/** The statuses that can witness bound live content. */
type WitnessedStatus = TransitionalStatus | 'presented';

function isTransitional(status: string | undefined): status is TransitionalStatus {
  return status === 'presenting' || status === 'dismissing';
}

function isWitnessable(status: string | undefined): status is WitnessedStatus {
  return status === 'presenting' || status === 'presented' || status === 'dismissing';
}

interface RemovedContentSettlement {
  /**
   * The animation effect observed `presentation` with bound content. A live
   * pair (`presenting`, `presented`, or `dismissing`) is witnessed; any other
   * status retires the witness.
   */
  contentBound(presentation: PresentationPair): void;

  /**
   * The animation effect observed `presentation` without bound content.
   *
   * Settles only when content was witnessed under this same still-live
   * transitional pair (or transferred forward to dismissing from an interrupted
   * entrance or live presented pair) and `lastAnimated` does not already mark that
   * pair as completed. `complete` runs in a microtask, outside the effect, and must
   * mark the pair completed before notifying, like the ordinary animation does:
   * `onPresentationComplete` for `presenting`, `onDismissalComplete` for
   * `dismissing`.
   *
   * Returns the effect cleanup: replacement content, a changed presentation, a
   * later attempt, or teardown re-runs or destroys the effect and cancels it.
   */
  contentLost(
    presentation: PresentationPair | undefined,
    lastAnimated: PresentationPair | null,
    complete: (pair: { status: TransitionalStatus; content: unknown }) => void
  ): (() => void) | undefined;
}

/**
 * Settles either transitional pair; the name is kept from the dismissal it first repaired.
 *
 * @internal
 */
export function createRemovedContentDismissal(): RemovedContentSettlement {
  // The live pair last observed with bound content.
  // Not reactive: only the effect that drives this seam reads and writes it.
  let witnessed: { readonly status: WitnessedStatus; readonly content: unknown } | null = null;

  return {
    contentBound(presentation) {
      const { status, content } = presentation;
      witnessed = isWitnessable(status) ? { status, content } : null;
    },

    contentLost(presentation, lastAnimated, complete) {
      const status = presentation?.status;
      if (
        presentation === undefined ||
        !isTransitional(status) ||
        witnessed === null ||
        witnessed.content !== presentation.content ||
        !(
          witnessed.status === status ||
          (status === 'dismissing' && (witnessed.status === 'presenting' || witnessed.status === 'presented'))
        )
      ) {
        // Never bound under this pair, or a different or later presentation: nothing to settle.
        witnessed = null;
        return undefined;
      }

      const { content } = presentation;
      // The ordinary animation or an earlier settlement already completed this pair.
      if (lastAnimated?.status === status && lastAnimated.content === content) return undefined;

      witnessed = { status, content };
      const owner = new AbortController();
      // Deferred like the ordinary completion; content rebound in the same flush cancels it first.
      queueMicrotask(() => {
        if (owner.signal.aborted) return;
        complete({ status, content });
      });
      return () => owner.abort();
    }
  };
}
