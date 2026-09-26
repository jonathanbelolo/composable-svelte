import type { TargetSchema, MotionRecipe, StableProjection } from '../motion/compiler.js';
import { stableProjection, serializeStableStyle } from '../motion/compiler.js';
import type { NumericDescriptors } from '../motion/properties.js';
import { planPlayback, type PlaybackDecision } from '../motion/playback-plan.js';
import { bindingPolicy, type BindingPolicy } from '../motion/binding-policy.js';
import type { TargetRegistry, TargetOwner, MotionBinding } from './target-registry.js';
import { createMotionPlayback, type MotionPlayback, type MotionPlaybackDiagnostic } from './motion-playback.js';

const MAX_DIAGNOSTIC_RECORDS = 32;
const MAX_NAME_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 1024;
/** TargetRegistry rejects longer binding channels; pure creation reaches the same verdict on server and client. */
const MAX_BINDING_CHANNEL_LENGTH = 128;

export type MotionLifecyclePhase = 'idle' | 'bound' | 'displaced' | 'retired';

export type MotionLifecycleCode =
  | 'invalid-state'
  | 'duplicate-attachment'
  | 'no-authority'
  | 'bind-failed'
  | 'playback-failed'
  | 'enrollment-failed'
  | 'release-failed'
  | 'stable-failed'
  | 'plan-failed'
  | 'request-failed'
  | 'forward-failed'
  | 'unbound-update'
  | 'recipe-change-ignored';

/** Bounded strings and enums only; never a node, binding, decision, recipe or error. */
export interface MotionLifecycleRecord {
  readonly kind: 'lifecycle';
  readonly code: MotionLifecycleCode;
  readonly name: string;
  readonly message: string;
}

export type MotionLifecycleDiagnostic = MotionLifecycleRecord | MotionPlaybackDiagnostic;

export interface MotionLifecycleOptions<S extends string> {
  /** Initial state captured once by the caller before context lookup. */
  readonly initial: S;
  /** Untracked latest-state getter: read once per attachment. */
  readonly read: () => S;
  /** The exact authorities captured from Svelte context; both undefined only where no host exists (SSR). */
  readonly registry: TargetRegistry | undefined;
  readonly owner: TargetOwner | undefined;
  /** Test-only counting seam for the one adapter construction. */
  readonly createPlayback?: typeof createMotionPlayback | undefined;
}

export interface MotionLifecycle<S extends string = string> {
  readonly style: string;
  /** Returns an attachment-token-checked, idempotent detach. */
  attach(node: HTMLElement): () => void;
  update(next: S): void;
  destroy(): void;
  recipeChangeIgnored(): void;
  readonly phase: MotionLifecyclePhase;
  readonly logical: S;
  readonly committed: S;
  /** Frozen snapshot of at most 32 records in insertion order, adapter records included. */
  readonly diagnostics: readonly MotionLifecycleDiagnostic[];
}

export interface MotionPresentEntry<
  T extends TargetSchema = TargetSchema,
  D extends keyof T & string = keyof T & string,
> {
  readonly name: D;
  readonly node: HTMLElement;
  readonly token: object;
}

export interface MotionSetLifecycle<
  T extends TargetSchema = TargetSchema,
  S extends string = string,
  D extends keyof T & string = keyof T & string,
> {
  readonly styles: Readonly<Record<D, string>>;
  topologyChanged(): void;
  reconcile(presentEntries: readonly MotionPresentEntry<T, D>[]): void;
  /** Single-target compatibility seam: retire and diagnose replacement of a connected pair. */
  replaceSingleAttachment(): void;
  update(next: S): void;
  destroy(): void;
  recipeChangeIgnored(): void;
  readonly phase: MotionLifecyclePhase;
  readonly logical: S;
  readonly committed: S;
  readonly diagnostics: readonly MotionLifecycleDiagnostic[];
}

interface BoundPair<T extends TargetSchema, D extends keyof T & string> {
  readonly binding: MotionBinding;
  readonly playback: MotionPlayback;
  readonly entries: readonly MotionPresentEntry<T, D>[];
  /** The one frozen present-name array: bind input source and planner availability. */
  readonly names: readonly D[];
  readonly registry: TargetRegistry;
}

function boundedText(value: unknown, limit: number, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : fallback;
}

function readField(source: object, key: 'name' | 'message'): unknown {
  try {
    return Reflect.get(source, key);
  } catch {
    // A throwing accessor yields the bounded fallback text.
    return undefined;
  }
}

function lifecycleRecord(code: MotionLifecycleCode, detail: unknown, fallback: string): MotionLifecycleRecord {
  let name: unknown;
  let message: unknown;
  if (typeof detail === 'string') {
    message = detail;
  } else if (detail !== null && typeof detail === 'object') {
    name = readField(detail, 'name');
    message = readField(detail, 'message');
  }
  return Object.freeze({
    kind: 'lifecycle',
    code,
    name: boundedText(name, MAX_NAME_LENGTH, 'MotionLifecycle'),
    message: boundedText(message, MAX_MESSAGE_LENGTH, fallback),
  });
}

/**
 * The public single-target rule. The brand and state check runs first, so a non-recipe value
 * fails as 'Expected a defined motion recipe' and never as a property-access error.
 */
export function soleMotionTarget<T extends TargetSchema, S extends string, N extends NumericDescriptors>(
  recipe: MotionRecipe<T, S, N>,
  initial: NoInfer<S>,
): keyof T & string {
  stableProjection(recipe, initial);
  const declared = Object.keys(recipe.targets);
  if (declared.length !== 1) throw new TypeError('Motion recipe must declare exactly one target');
  return declared[0] as keyof T & string;
}

/**
 * Private, Svelte-free lifecycle for one fixed declared target set. It owns at most one {binding, playback}
 * pair. Own state always moves before an outbound or reentrant call (getter, bind, release,
 * stable, request, observer), and authority is rechecked afterwards.
 */
export function createMotionSetLifecycle<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors = NumericDescriptors,
  D extends keyof T & string = keyof T & string,
>(
  recipe: MotionRecipe<T, S, N>,
  declared: readonly D[],
  options: MotionLifecycleOptions<S>,
): MotionSetLifecycle<T, S, D> {
  const { initial, read, registry, owner, createPlayback } = options;
  if (typeof read !== 'function') throw new TypeError('Motion lifecycle requires a read function');
  if ((registry === undefined) !== (owner === undefined)) {
    throw new TypeError('Motion lifecycle requires a registry together with its target owner');
  }

  // Pure creation: brand and initial state first, then the declared targets, policy and channel bound.
  stableProjection(recipe, initial);
  const declaredSet = new Set<D>();
  for (const name of declared) {
    if (!Object.hasOwn(recipe.targets, name)) {
      throw new TypeError(`Unknown motion target ${String(name)}`);
    }
    if (declaredSet.has(name)) {
      throw new TypeError(`Duplicate declared motion target ${String(name)}`);
    }
    declaredSet.add(name);
  }

  const declaredSelection: readonly D[] = Object.freeze([...declared]);
  const absent: readonly D[] = Object.freeze([]);
  const policy: BindingPolicy = bindingPolicy(recipe, declaredSelection);
  if (policy.channel.length > MAX_BINDING_CHANNEL_LENGTH) {
    throw new TypeError(`Motion binding channel exceeds ${MAX_BINDING_CHANNEL_LENGTH} characters`);
  }

  // Every declared D is populated once before the record is frozen. The assertion preserves D;
  // it does not widen the recipe keys to string or claim keys outside the fixed selection.
  const stylesRecord = Object.create(null) as Record<D, string>;
  for (const name of declaredSelection) {
    stylesRecord[name] = serializeStableStyle(recipe, initial, name);
  }
  const styles: Readonly<Record<D, string>> = Object.freeze(stylesRecord);

  let logical: S = initial;
  let committed: S = initial;
  let phase: MotionLifecyclePhase = 'idle';
  let pair: BoundPair<T, D> | undefined;
  let epoch = 0;
  let topologyGeneration = 0;
  let serial = 0;
  let recipeChangeNoted = false;

  const ring: MotionLifecycleDiagnostic[] = [];
  const emit = (record: MotionLifecycleDiagnostic): void => {
    ring.push(record);
    if (ring.length > MAX_DIAGNOSTIC_RECORDS) ring.shift();
  };
  const note = (code: MotionLifecycleCode, detail: unknown, fallback = 'Motion lifecycle diagnostic'): void => {
    emit(lifecycleRecord(code, detail, fallback));
  };
  const retired = (): boolean => phase === 'retired';
  const isDeclaredName = (value: unknown): value is D =>
    typeof value === 'string' && declaredSelection.some((name) => name === value);
  const isElementLike = (value: unknown): value is HTMLElement => {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
    const candidate = value as { readonly nodeType?: unknown; readonly style?: unknown };
    const style = candidate.style;
    if (candidate.nodeType !== 1 || typeof style !== 'object' || style === null) return false;
    return typeof (style as { readonly setProperty?: unknown }).setProperty === 'function';
  };

  const forward = (error: unknown): void => {
    if (registry === undefined) return;
    try {
      registry.observeCleanup(() => {
        throw error;
      });
    } catch (failure) {
      note('forward-failed', failure, 'Motion lifecycle failure could not be forwarded');
    }
  };

  const release = (binding: MotionBinding): void => {
    try {
      binding.release();
    } catch (error) {
      note('release-failed', error, 'Motion binding release failed');
      forward(error);
    }
  };

  /** Takes the pair out of state and advances the generation before the one release call. */
  function retire(next: 'idle' | 'displaced' | 'retired'): void {
    const current = pair;
    pair = undefined;
    if (current !== undefined) epoch++;
    if (phase !== 'retired') phase = next;
    if (current !== undefined) release(current.binding);
  }

  function topologyChanged(): void {
    if (retired()) return;
    topologyGeneration++;
    const current = pair;
    pair = undefined;
    epoch++;
    if (phase !== 'retired') phase = 'idle';
    if (current !== undefined) release(current.binding);
  }

  function reconcile(presentEntries: readonly MotionPresentEntry<T, D>[]): void {
    if (retired()) return;
    const generation = topologyGeneration;

    if (!Array.isArray(presentEntries)) {
      throw new TypeError('Reconciliation requires an array of present entries');
    }

    const entriesByName = new Map<D, MotionPresentEntry<T, D>[]>();
    for (const entry of presentEntries) {
      if (!entry || typeof entry !== 'object') {
        throw new TypeError('Invalid present entry');
      }
      // Caller-owned fields are hostile boundaries: capture each exactly once, validate the
      // captures, and retain only this owned frozen snapshot.
      const capturedName: unknown = entry.name;
      const capturedNode: unknown = entry.node;
      const capturedToken: unknown = entry.token;
      if (!isDeclaredName(capturedName)) {
        throw new TypeError(`Unknown motion target ${String(capturedName)}`);
      }
      if (!isElementLike(capturedNode)) {
        throw new TypeError('A binding target requires an element node');
      }
      if (capturedToken === null || typeof capturedToken !== 'object') {
        throw new TypeError('A binding target requires an attachment token');
      }
      const name = capturedName;
      const node = capturedNode;
      const token = capturedToken;
      const owned = Object.freeze({ name, node, token });
      const list = entriesByName.get(name);
      if (list === undefined) {
        entriesByName.set(name, [owned]);
      } else {
        list.push(owned);
      }
    }

    const validEntries: MotionPresentEntry<T, D>[] = [];
    const presentNamesList: D[] = [];
    for (const name of declaredSelection) {
      const list = entriesByName.get(name);
      if (list === undefined) continue;
      if (list.length === 1) {
        validEntries.push(list[0]!);
        presentNamesList.push(name);
      } else {
        note('duplicate-attachment', 'A duplicate live target name was excluded from motion reconciliation');
      }
    }

    const presentNames: readonly D[] = Object.freeze(presentNamesList);
    const frozenEntries: readonly MotionPresentEntry<T, D>[] = Object.freeze(validEntries);

    if (topologyGeneration !== generation || retired()) return;

    if (pair !== undefined) {
      const identical = pair.entries.length === frozenEntries.length && pair.entries.every((current, index) => {
        const next = frozenEntries[index];
        return next !== undefined && current.name === next.name && current.node === next.node && current.token === next.token;
      });
      if (identical) return;
      // An older coalesced snapshot carries no authority over the already installed token set.
      // The helper calls topologyChanged before every accepted mutation, so a genuinely current
      // changed snapshot reaches this point only after the incumbent has been synchronously retired.
      return;
    }

    if (presentNames.length === 0) return;

    let latestState: S;
    let projection: StableProjection<T>;
    try {
      latestState = read();
      projection = stableProjection(recipe, latestState);
    } catch (error) {
      note('invalid-state', error, 'Motion state could not be read at attachment');
      return;
    }
    if (topologyGeneration !== generation || retired()) return;
    logical = committed = latestState;

    if (registry === undefined || owner === undefined) {
      phase = 'displaced';
      note('no-authority', 'No target registry was captured for this attachment');
      return;
    }

    const nodeMap = new Map<D, HTMLElement>();
    for (const entry of frozenEntries) {
      nodeMap.set(entry.name, entry.node);
    }
    const input = presentNames.map((name) => ({
      name,
      node: nodeMap.get(name)!,
      properties: recipe.targets[name]!.properties,
      stable: projection[name]!,
    }));

    let binding: MotionBinding;
    try {
      binding = registry.bind(owner, input, policy);
    } catch (error) {
      if (topologyGeneration === generation && !retired()) phase = 'displaced';
      note('bind-failed', error, 'Motion binding failed');
      forward(error);
      return;
    }
    if (topologyGeneration !== generation || retired()) {
      release(binding);
      return;
    }

    const sink = { diagnostic: emit };
    let playback: MotionPlayback;
    try {
      playback = createPlayback === undefined ? createMotionPlayback(binding, sink) : createPlayback(binding, sink);
    } catch (error) {
      if (topologyGeneration === generation && !retired()) phase = 'displaced';
      note('playback-failed', error, 'Motion playback adapter construction failed');
      release(binding);
      forward(error);
      return;
    }
    if (topologyGeneration !== generation || retired()) {
      release(binding);
      return;
    }

    const installed: BoundPair<T, D> = Object.freeze({
      binding,
      playback,
      entries: frozenEntries,
      names: presentNames,
      registry,
    });
    pair = installed;
    phase = 'bound';
    const pairGeneration = ++epoch;
    try {
      binding.record.addCleanup(() => {
        if (pair !== installed || epoch !== pairGeneration) return;
        pair = undefined;
        epoch++;
        if (phase !== 'retired') phase = 'displaced';
      });
    } catch (error) {
      note('enrollment-failed', error, 'Motion binding cleanup enrollment failed');
      if (pair === installed) retire('displaced');
      forward(error);
      return;
    }
    if (pair === installed) {
      if (!binding.live) {
        retire('displaced');
      } else if (topologyGeneration !== generation) {
        retire('idle');
      }
    }
  }

  function update(next: S): void {
    if (retired()) return;
    // Strict same-state no-op: no plan, no request and no generation bump, even during a run.
    if (Object.is(next, logical)) return;
    let projection: StableProjection<T>;
    try {
      projection = stableProjection(recipe, next);
    } catch (error) {
      // Programmer error: nothing is accepted and nothing is published.
      note('invalid-state', error, 'Unknown motion state');
      return;
    }
    const request = ++serial;
    const from = committed;
    logical = committed = next;
    const bound = pair;
    if (bound === undefined) {
      // Zero present targets: the planner alone classifies. No binding, adapter, run or terminal exists.
      if (phase === 'idle') classifyAbsent(from, next);
      return;
    }
    if (!bound.binding.live) {
      retire('displaced');
      return;
    }
    if (!bound.registry.isAttached) {
      // Before host attachment only the stored projection moves; activation writes it once.
      try {
        for (const name of bound.names) {
          if (pair !== bound || serial !== request) return;
          bound.binding.stable(name, projection[name]!);
        }
      } catch (error) {
        note('stable-failed', error, 'Motion stable publication failed');
        forward(error);
      }
      return;
    }
    let failure: { readonly error: unknown } | undefined;
    let decision: PlaybackDecision<T> | undefined;
    try {
      // Planning completes before the first side effect. Every different-state decision is routed
      // unchanged, zero-work successors included, so the adapter always supersedes the incumbent.
      decision = planPlayback(recipe, { from, to: next, availableTargets: bound.names });
    } catch (error) {
      failure = { error };
      note('plan-failed', error, 'Motion playback planning failed');
    }
    if (decision !== undefined) {
      try {
        bound.playback.request(decision);
      } catch (error) {
        failure = { error };
        note('request-failed', error, 'Motion playback request failed');
      }
    }
    if (pair === bound && serial === request && !bound.binding.live) retire('displaced');
    if (failure !== undefined) forward(failure.error);
  }

  function classifyAbsent(from: S, to: S): void {
    try {
      const decision = planPlayback(recipe, { from, to, availableTargets: absent });
      const reason = decision.kind === 'stable-only' ? decision.reason : decision.kind;
      note('unbound-update', { name: reason, message: 'No target is present; the latest state is kept for adoption' });
    } catch (error) {
      note('plan-failed', error, 'Motion playback planning failed');
    }
  }

  function destroy(): void {
    if (retired()) return;
    phase = 'retired';
    topologyGeneration++;
    serial++;
    const current = pair;
    pair = undefined;
    epoch++;
    if (current !== undefined) release(current.binding);
  }

  function recipeChangeIgnored(): void {
    if (recipeChangeNoted || retired()) return;
    recipeChangeNoted = true;
    note('recipe-change-ignored', 'The recipe is captured once; a replacement was ignored');
  }

  function replaceSingleAttachment(): void {
    if (retired()) return;
    const replacedConnected = pair?.entries[0]?.node.isConnected === true;
    topologyChanged();
    if (replacedConnected) {
      note('duplicate-attachment', 'A still-connected node was replaced by a newer attachment');
    }
  }

  return Object.freeze({
    styles,
    topologyChanged,
    reconcile,
    replaceSingleAttachment,
    update,
    destroy,
    recipeChangeIgnored,
    get phase(): MotionLifecyclePhase {
      return phase;
    },
    get logical(): S {
      return logical;
    },
    get committed(): S {
      return committed;
    },
    get diagnostics(): readonly MotionLifecycleDiagnostic[] {
      return Object.freeze(ring.slice());
    },
  });
}

/**
 * Public single-target lifecycle: thin adapter over createMotionSetLifecycle.
 */
export function createMotionLifecycle<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors = NumericDescriptors,
>(
  recipe: MotionRecipe<T, S, N>,
  target: keyof T & string,
  options: MotionLifecycleOptions<S>,
): MotionLifecycle<S> {
  const declared: readonly (keyof T & string)[] = Object.freeze([target]);
  const controller = createMotionSetLifecycle(recipe, declared, options);
  let attachment: object | undefined;
  const active = (): boolean => controller.phase !== 'retired';

  function attach(node: HTMLElement): () => void {
    const token = {};
    const detach = (): void => {
      if (attachment !== token) return;
      attachment = undefined;
      controller.topologyChanged();
    };
    if (!active()) return detach;

    attachment = token;
    controller.replaceSingleAttachment();
    if (attachment !== token || !active()) return detach;
    controller.reconcile(Object.freeze([{ name: target, node, token }]));
    return detach;
  }

  function destroy(): void {
    attachment = undefined;
    controller.destroy();
  }

  return Object.freeze({
    style: controller.styles[target]!,
    attach,
    update: (next: S) => controller.update(next),
    destroy,
    recipeChangeIgnored: () => controller.recipeChangeIgnored(),
    get phase(): MotionLifecyclePhase {
      return controller.phase;
    },
    get logical(): S {
      return controller.logical;
    },
    get committed(): S {
      return controller.committed;
    },
    get diagnostics(): readonly MotionLifecycleDiagnostic[] {
      return controller.diagnostics;
    },
  });
}
