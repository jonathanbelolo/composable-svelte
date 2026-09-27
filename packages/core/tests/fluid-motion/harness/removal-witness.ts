/**
 * Witness for source removal and representation reveal.
 *
 * Three observation points bound the reveal in time:
 * 1. Rendering checkpoints while the source is connected (./checkpoint.ts): the last two are kept,
 *    with representation state and source opacity/geometry. Source geometry is read only while
 *    the source is connected.
 * 2. The MutationObserver delivery that first sees the source disconnected. It runs at a microtask
 *    checkpoint after the removing mutation, before the next rendering update. It is a DOM
 *    observation, not the renderer's beforeRemoval callback.
 * 3. The first rendering checkpoint after removal (`followUp`).
 *
 * `revealedWithinRemovalInterval` holds when the representation was not eligible at (1) and is
 * eligible at (2): no rendering update saw both source-connected-and-revealed or neither. It does
 * not by itself show that the source was suppressed at (1); pair it with the recorder's boundary
 * analysis. "Eligible" is DOM/style paint eligibility (./observe.ts), not compositor proof.
 *
 * Failure: any error thrown while observing (source/representation queries or DOM reads, in either
 * callback) ends observation as a unit: both observers disconnect, `error` is set, and no event or
 * follow-up is produced after it. An event recorded before the failure is kept; `error` then says
 * that later observation points are missing.
 */
import { startRenderingCheckpoints, type RenderingCheckpointLoop } from './checkpoint.js';
import { observeElement, observeRepresentation, resolveElement, type ElementQuery } from './observe.js';
import type { RemovalCheckpoint, RemovalFollowUp, RemovalWitnessEvent } from './types.js';

export interface RemovalWitnessOptions {
  /** Target root container where DOM removal occurs */
  container: Node;
  /** The source element or query to monitor for removal */
  source: ElementQuery;
  /** The representation element or query to inspect at each observation point */
  representation?: ElementQuery;
}

export interface RemovalWitness {
  readonly event: RemovalWitnessEvent | undefined;
  readonly isTriggered: boolean;
  /** Representation at the first rendering checkpoint after removal (added in harness correction) */
  readonly followUp: RemovalFollowUp | undefined;
  /** First observation error, prefixed with its phase ('checkpoint' | 'removal'); once set, observation has ended (added in harness correction) */
  readonly error: string | undefined;
  /** Whether both observers are still subscribed (added in harness follow-up) */
  readonly isObserving: boolean;
  disconnect(): void;
}

export function createRemovalWitness(options: RemovalWitnessOptions): RemovalWitness {
  let event: RemovalWitnessEvent | undefined;
  let followUp: RemovalFollowUp | undefined;
  let error: string | undefined;
  let isTriggered = false;
  let last: RemovalCheckpoint | undefined;
  let previous: RemovalCheckpoint | undefined;
  let checkpoints: RenderingCheckpointLoop | undefined;
  let observer: MutationObserver | undefined;
  let isObserving = true;

  const end = () => {
    isObserving = false;
    observer?.disconnect();
    checkpoints?.stop();
  };
  const fail = (phase: 'checkpoint' | 'removal', cause: unknown) => {
    if (error === undefined) error = `${phase}: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`;
    end();
  };

  const initialSource = resolveElement(options.source);
  const source = () => initialSource ?? resolveElement(options.source);
  const representation = () => resolveElement(options.representation);

  const onCheckpoint = (time: number) => {
    if (!isObserving) return;
    try {
      if (!isTriggered) {
        const sourceEl = source();
        if (!sourceEl || !sourceEl.isConnected) return;
        const observed = observeElement(sourceEl);
        previous = last;
        last = {
          time,
          representation: observeRepresentation(representation()),
          sourceOpacity: observed.opacity ?? 0,
          sourceRect: observed.rect!,
          sourcePaintEligible: observed.paintEligible ?? false
        };
        return;
      }
      if (!followUp) {
        followUp = { time, representation: observeRepresentation(representation()) };
        end();
      }
    } catch (cause) {
      fail('checkpoint', cause);
    }
  };
  checkpoints = startRenderingCheckpoints(onCheckpoint);

  observer = new MutationObserver(() => {
    if (!isObserving || isTriggered) return;
    try {
      const sourceEl = source();
      if (!sourceEl || sourceEl.isConnected) return;
      const time = performance.now();
      // Retired source geometry is never read here.
      const atRemoval = observeRepresentation(representation());
      const revealedWithinRemovalInterval =
        last !== undefined && !last.representation.isPaintEligible && atRemoval.isPaintEligible;
      // Triggered only with a complete event; a failed read above leaves both unset.
      event = {
        time,
        contemporaneousRepresentation: atRemoval,
        sameFlushReveal: revealedWithinRemovalInterval,
        lastCheckpointBeforeRemoval: last,
        previousCheckpointBeforeRemoval: previous,
        revealedWithinRemovalInterval
      };
      isTriggered = true;
    } catch (cause) {
      fail('removal', cause);
    }
  });
  observer.observe(options.container, { childList: true, subtree: true });

  return {
    get event() {
      return event;
    },
    get isTriggered() {
      return isTriggered;
    },
    get followUp() {
      return followUp;
    },
    get error() {
      return error;
    },
    get isObserving() {
      return isObserving;
    },
    disconnect() {
      end();
    }
  };
}
