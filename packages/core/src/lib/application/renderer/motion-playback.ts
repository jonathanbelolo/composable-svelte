import type { TargetSchema } from '../motion/compiler.js';
import type { PlayDecision, PlaybackDecision, PublishableStable, StableOnlyDecision } from '../motion/playback-plan.js';
import type { MotionProperty } from '../motion/properties.js';
import {
  resolveEnginePlan,
  type EnginePropertyFallback,
  type EngineTrackSpec,
  type PairCapabilityFallbackReason,
} from './motion-capability.js';
import { playMotionValue, type MotionEngineHandle, type MotionTrackSpec } from './motion-engine.js';
import type { MotionPlan, MotionRun, MotionRunContext } from './motion-run.js';
import type { PropertyLease } from './property-leases.js';
import type { MotionBinding } from './target-registry.js';

/** One bounded margin on MotionChannel's existing deadline. It creates no clock or timer. */
const PRIVATE_SETTLEMENT_SLACK_MS = 100;
const MAX_DEADLINE_MS = 2_147_483_647;
const MAX_DIAGNOSTIC_RECORDS = 32;
const MAX_DIAGNOSTIC_ENTRIES = 8;
const MAX_NAME_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 1024;

export type MotionPlaybackPlay = (track: MotionTrackSpec, write: (value: string) => void) => MotionEngineHandle;

export interface MotionPlaybackFallbackEntry {
  readonly target: string;
  readonly property: string;
  readonly reason: PairCapabilityFallbackReason;
}

/** Bounded strings and enums only; never a decision, compiled plan, node, lease, handle or error. */
export type MotionPlaybackDiagnostic =
  | { readonly kind: 'request-rejected'; readonly phase: 'pre-read' | 'publication' | 'start'; readonly name: string; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: 'compile-rejected'; readonly name: string; readonly message: string }
  | { readonly kind: 'unavailable'; readonly reason: 'missing-required'; readonly targets: readonly string[]; readonly total: number }
  | { readonly kind: 'interpolation-fallback'; readonly entries: readonly MotionPlaybackFallbackEntry[]; readonly total: number };

export interface MotionPlaybackOptions {
  /** Test-only injection of a compatible engine. */
  readonly play?: MotionPlaybackPlay | undefined;
  /** Observational only. Synchronous throws and rejected returns are contained. */
  readonly diagnostic?: ((record: MotionPlaybackDiagnostic) => unknown) | undefined;
}

export interface MotionPlayback {
  request<T extends TargetSchema>(decision: PlaybackDecision<T>): MotionRun | undefined;
  /** Frozen snapshot of at most 32 records in insertion order. */
  readonly diagnostics: readonly MotionPlaybackDiagnostic[];
}

type SkipReason = NonNullable<MotionPlan['skip']>;
type RejectionPhase = Extract<MotionPlaybackDiagnostic, { kind: 'request-rejected' }>['phase'];
type StableValues = Parameters<MotionBinding['stable']>[1];
type StablePublication = readonly [target: string, values: StableValues];

interface SequencedTrack {
  readonly spec: EngineTrackSpec;
  /** Chronological position on its address; resolver order breaks ties. */
  readonly rank: number;
}

interface PlaybackAddress {
  readonly target: string;
  readonly property: MotionProperty;
  /** Resolver order with every absolute startMs preserved. */
  readonly tracks: readonly SequencedTrack[];
  /** Serialized source value of the earliest playable track. */
  readonly initial: string;
}

interface PreparedRequest {
  readonly publications: readonly StablePublication[];
  readonly plan: MotionPlan;
  readonly diagnostic: MotionPlaybackDiagnostic | undefined;
}

interface AddressState {
  readonly address: PlaybackAddress;
  open: boolean;
  /** Length of the completed chronological prefix. */
  unlocked: number;
  readonly completed: boolean[];
  readonly stops: (() => void)[];
}

/** Data-free. Lease release is the sole settlement projection and reads the latest stable value. */
function noopStable(): void {}
function noopExecute(): void {}

function boundedText(value: unknown, limit: number, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : fallback;
}

function boundedError(error: unknown): { readonly name: string; readonly message: string } {
  let name: unknown;
  let message: unknown;
  if (typeof error === 'string') {
    message = error;
  } else if (error !== null && typeof error === 'object') {
    try {
      name = Reflect.get(error, 'name');
    } catch {
      // Guard against throwing name accessor
    }
    try {
      message = Reflect.get(error, 'message');
    } catch {
      // Guard against throwing message accessor
    }
  }
  return {
    name: boundedText(name, MAX_NAME_LENGTH, 'Error'),
    message: boundedText(message, MAX_MESSAGE_LENGTH, 'Motion playback request rejected'),
  };
}

function zeroWorkPlan(skip?: SkipReason): MotionPlan {
  return skip === undefined
    ? { deadlineMs: 0, execute: noopExecute, stable: noopStable, complete: true }
    : { deadlineMs: 0, execute: noopExecute, stable: noopStable, skip };
}

/** Fresh frozen [target, values] records; every target, property and value is read here. */
function copyStable<T extends TargetSchema>(publishable: PublishableStable<T>): readonly StablePublication[] {
  if (publishable === null || typeof publishable !== 'object' || Array.isArray(publishable)) {
    throw new TypeError('Publishable stable projection must be a non-null record');
  }
  const publications: StablePublication[] = [];
  for (const [target, source] of Object.entries(publishable)) {
    if (source === null || typeof source !== 'object' || Array.isArray(source)) {
      throw new TypeError('Publishable stable entry must be a non-null record');
    }
    const values: StableValues = Object.freeze({ ...source });
    for (const value of Object.values(values)) {
      if (typeof value !== 'string') throw new TypeError('Stable projection values must be serialized strings');
    }
    const publication: StablePublication = [target, values];
    publications.push(Object.freeze(publication));
  }
  if (publications.length === 0) {
    throw new TypeError('Publishable stable projection cannot be empty');
  }
  return Object.freeze(publications);
}

function fallbackDiagnostic(fallbacks: readonly EnginePropertyFallback[]): MotionPlaybackDiagnostic {
  const entries = fallbacks.slice(0, MAX_DIAGNOSTIC_ENTRIES).map((fallback) => Object.freeze({
    target: boundedText(fallback.target, MAX_NAME_LENGTH, ''),
    property: boundedText(fallback.property, MAX_NAME_LENGTH, ''),
    reason: fallback.reason,
  }));
  return Object.freeze({ kind: 'interpolation-fallback', entries: Object.freeze(entries), total: fallbacks.length });
}

function compileRejectedDiagnostic(detail: StableOnlyDecision['diagnostic']): MotionPlaybackDiagnostic {
  return Object.freeze({
    kind: 'unavailable',
    reason: 'compile-rejected',
    name: boundedText(detail?.name, MAX_NAME_LENGTH, 'Error'),
    message: boundedText(detail?.message, MAX_MESSAGE_LENGTH, 'Motion compilation rejected'),
  });
}

function missingRequiredDiagnostic(compiled: { readonly missingRequired: readonly string[] } | undefined): MotionPlaybackDiagnostic {
  const missing: readonly string[] = compiled?.missingRequired ?? [];
  const targets = missing.slice(0, MAX_DIAGNOSTIC_ENTRIES).map((target) => boundedText(target, MAX_NAME_LENGTH, ''));
  return Object.freeze({ kind: 'unavailable', reason: 'missing-required', targets: Object.freeze(targets), total: missing.length });
}

/** One address per exact (target, property); nested maps cannot collide. */
function groupAddresses(tracks: readonly EngineTrackSpec[]): readonly PlaybackAddress[] {
  const byTarget = new Map<string, Map<MotionProperty, EngineTrackSpec[]>>();
  const groups: { readonly target: string; readonly property: MotionProperty; readonly specs: EngineTrackSpec[] }[] = [];
  for (const spec of tracks) {
    let byProperty = byTarget.get(spec.target);
    if (!byProperty) {
      byProperty = new Map<MotionProperty, EngineTrackSpec[]>();
      byTarget.set(spec.target, byProperty);
    }
    let specs = byProperty.get(spec.property);
    if (!specs) {
      specs = [];
      byProperty.set(spec.property, specs);
      groups.push({ target: spec.target, property: spec.property, specs });
    }
    specs.push(spec);
  }
  return Object.freeze(groups.map(({ target, property, specs }) => {
    // The sink gate is chronological; a stable sort keeps resolver order for equal starts.
    const chronological = [...specs].sort((a, b) => a.startMs - b.startMs);
    const first = chronological[0];
    if (!first) throw new TypeError('A playback address requires a track');
    const sequenced = specs.map((spec) => Object.freeze({ spec, rank: chronological.indexOf(spec) }));
    return Object.freeze({ target, property, tracks: Object.freeze(sequenced), initial: first.from.css });
  }));
}

function stopAddress(state: AddressState, errors: unknown[]): void {
  state.open = false;
  for (const stop of state.stops.splice(0)) {
    try {
      stop();
    } catch (error) {
      errors.push(error);
    }
  }
}

function raise(errors: readonly unknown[]): void {
  if (errors.length) throw new AggregateError(errors, 'Motion engine stop failed');
}

function leaseLost(): Error {
  return new Error('Motion property lease was lost during playback setup');
}

function observeSettlement(handle: MotionEngineHandle, state: AddressState, rank: number): Promise<void> {
  const settled = handle.settled;
  const completion = new Promise<void>((resolve, reject) => {
    // Promise.resolve defers even a synchronously settled or hostile thenable to a microtask.
    void Promise.resolve(settled)
      .then((settlement) => {
        if (settlement.status === 'completed') {
          state.completed[rank] = true;
          while (state.completed[state.unlocked]) state.unlocked++;
          resolve();
        } else if (settlement.status === 'failed') {
          reject(settlement.error);
        }
        // Stopped stays pending: supersession or disposal already owns the terminal.
      }, reject)
      .then(undefined, reject);
  });
  // Observed for good, so a failure after aggregate rejection or stop is never unhandled.
  void completion.then(undefined, () => {});
  return completion;
}

function runPlayback(
  binding: MotionBinding,
  play: MotionPlaybackPlay,
  addresses: readonly PlaybackAddress[],
  context: MotionRunContext,
): void | Promise<void> {
  if (!context.live) return;
  let open = true;
  const states: AddressState[] = addresses.map((address) => ({ address, open: true, unlocked: 0, completed: [], stops: [] }));
  // Closes every sink before stopping any handle. Adopted before any acquisition, so record
  // cleanup stops engines before the later-adopted lease releases expose the latest stable value.
  const stopAll = (): void => {
    if (!open) return;
    open = false;
    for (const state of states) state.open = false;
    const errors: unknown[] = [];
    for (const state of states) stopAddress(state, errors);
    raise(errors);
  };
  context.adopt(stopAll);

  const leased: { readonly state: AddressState; readonly lease: PropertyLease }[] = [];
  for (const state of states) {
    if (!context.live || !open) return;
    // Address cleanup covers a property stolen before whole-run settlement.
    const stop = (): void => {
      const errors: unknown[] = [];
      stopAddress(state, errors);
      raise(errors);
    };
    const lease = binding.lease(state.address.target, state.address.property, context, stop);
    if (!context.live || !open) return;
    if (!lease.live || !state.open) throw leaseLost();
    lease.write(state.address.initial);
    leased.push({ state, lease });
  }
  // Engines start only after every address lease exists and remains live.
  if (!context.live || !open) return;
  for (const { state, lease } of leased) {
    if (!lease.live || !state.open) throw leaseLost();
  }

  const completions: Promise<void>[] = [];
  for (const { state, lease } of leased) {
    for (const { spec, rank } of state.address.tracks) {
      if (!context.live || !open) return;
      if (!lease.live || !state.open) throw leaseLost();
      let handle: MotionEngineHandle | undefined;
      let stopped = false;
      const stopOnce = (): void => {
        if (stopped || !handle) return;
        stopped = true;
        handle.stop();
      };
      state.stops.push(stopOnce);
      // Forwards only after every earlier handle on this address completed, and only while
      // the run, the lease, the address sink and the adapter sink are all open.
      const sink = (value: string): void => {
        if (!open || !state.open || state.unlocked < rank || !context.live || !lease.live) return;
        lease.write(value);
      };
      const started = play(spec, sink);
      handle = started;
      completions.push(observeSettlement(started, state, rank));
      // A reentrant stop may have run before the handle existed; stop it now, at most once.
      if (!context.live || !open || !state.open || !lease.live) stopOnce();
    }
  }
  return Promise.all(completions).then(() => undefined);
}

function executablePlan(
  binding: MotionBinding,
  play: MotionPlaybackPlay,
  addresses: readonly PlaybackAddress[],
  deadlineMs: number,
): MotionPlan {
  // This scope holds no decision, publication list or destination stable value.
  return { deadlineMs, stable: noopStable, execute: (context) => runPlayback(binding, play, addresses, context) };
}

function preparePlay<T extends TargetSchema>(binding: MotionBinding, play: MotionPlaybackPlay, decision: PlayDecision<T>): PreparedRequest {
  const compiled = decision.compiled;
  const publishable = decision.publishable;
  const publications = copyStable(publishable);
  const durationMs = compiled.durationMs;
  if (!Number.isFinite(durationMs) || durationMs < 0) throw new RangeError('Motion playback duration must be finite and nonnegative');
  const resolved = resolveEnginePlan(compiled);
  const tracks = resolved.tracks;
  const fallbacks = resolved.fallbacks;
  const diagnostic = fallbacks.length > 0 ? fallbackDiagnostic(fallbacks) : undefined;
  if (tracks.length === 0) {
    // Unsupported requested interpolation never claims completion; identity and instant pairs do.
    return { publications, plan: zeroWorkPlan(fallbacks.length > 0 ? 'unavailable' : undefined), diagnostic };
  }
  const deadlineMs = Math.min(durationMs + PRIVATE_SETTLEMENT_SLACK_MS, MAX_DEADLINE_MS);
  return { publications, plan: executablePlan(binding, play, groupAddresses(tracks), deadlineMs), diagnostic };
}

function prepareStableOnly<T extends TargetSchema>(decision: StableOnlyDecision<T>): PreparedRequest {
  const reason = decision.reason;
  const publishable = decision.publishable;
  const publications = copyStable(publishable);
  let skip: SkipReason | undefined;
  let diagnostic: MotionPlaybackDiagnostic | undefined;
  switch (reason) {
    case 'disabled':
      skip = 'disabled';
      break;
    case 'reduced':
      skip = 'reducedMotion';
      break;
    case 'compile-rejected':
      skip = 'unavailable';
      diagnostic = compileRejectedDiagnostic(decision.diagnostic);
      break;
    case 'missing-required':
      skip = 'unavailable';
      diagnostic = missingRequiredDiagnostic(decision.compiled);
      break;
    case 'all-optional-skipped':
    case 'empty-tracks':
    case 'zero-duration':
      break;
    default:
      throw new TypeError('Unknown playback reason');
  }
  return { publications, plan: zeroWorkPlan(skip), diagnostic };
}

/** Reads every decision field once and resolves capability completely, without side effects. */
function prepare<T extends TargetSchema>(binding: MotionBinding, play: MotionPlaybackPlay, decision: PlaybackDecision<T>): PreparedRequest {
  const kind = decision.kind;
  if (kind === 'play') return preparePlay(binding, play, decision);
  if (kind === 'stable-only') return prepareStableOnly(decision);
  throw new TypeError('Unknown playback decision');
}

/**
 * Private playback adapter. Exactly one instance owns request coordination for a binding:
 * the future private caller creates it once alongside the binding and reuses it for the
 * binding's lifetime. No registry enforces that precondition and no barrel exports this.
 */
export function createMotionPlayback(
  binding: MotionBinding,
  { play = playMotionValue, diagnostic }: MotionPlaybackOptions = {},
): MotionPlayback {
  const ring: MotionPlaybackDiagnostic[] = [];
  let generation = 0;

  // The ring is updated first. Sink failures never generate diagnostics or change authority.
  const emit = (record: MotionPlaybackDiagnostic): void => {
    ring.push(record);
    if (ring.length > MAX_DIAGNOSTIC_RECORDS) ring.shift();
    if (!diagnostic) return;
    try {
      void Promise.resolve(diagnostic(record)).then(undefined, () => {});
    } catch {
      // Diagnostics cannot own settlement.
    }
  };

  const request = <T extends TargetSchema>(decision: PlaybackDecision<T>): MotionRun | undefined => {
    const requestGeneration = ++generation;
    const incumbent = binding.current;
    const current = (): boolean => generation === requestGeneration && binding.current === incumbent;
    const authoritative = (): boolean => current() && binding.live;
    // A stale request reports nothing; a current one records exactly one bounded failure.
    const reject = (phase: RejectionPhase, error: unknown): undefined => {
      const { name, message } = boundedError(error);
      if (!current()) return undefined;
      emit(Object.freeze({ kind: 'request-rejected', phase, name, message }));
      return undefined;
    };

    let prepared: PreparedRequest;
    try {
      if (!binding.live) throw new Error('Motion playback requires a live binding');
      prepared = prepare(binding, play, decision);
    } catch (error) {
      return reject('pre-read', error);
    }

    for (const [target, values] of prepared.publications) {
      if (!authoritative()) return undefined;
      try {
        binding.stable(target, values);
      } catch (error) {
        return reject('publication', error);
      }
      if (!authoritative()) return undefined;
    }
    if (!authoritative()) return undefined;

    let run: MotionRun;
    try {
      run = binding.start(prepared.plan);
    } catch (error) {
      return reject('start', error);
    }
    // The sink never interposes between publication and supersession, and a request that
    // lost to a nested newer request during start stays silent.
    if (prepared.diagnostic !== undefined && generation === requestGeneration && binding.live && binding.current === run) emit(prepared.diagnostic);
    return run;
  };

  return Object.freeze({
    request,
    get diagnostics(): readonly MotionPlaybackDiagnostic[] {
      return Object.freeze(ring.slice());
    },
  });
}
