import { exactKeys, visualCopy } from './data.js';
import {
  type MotionRecipe,
  type TargetSchema,
  type CompiledMotion,
  type StableProjection,
  stableProjection,
  compileMotion,
} from './compiler.js';
import { type NumericDescriptors } from './properties.js';
import { type TokenOverrides } from './tokens.js';

export interface PlaybackErrorDiagnostic {
  readonly name: string;
  readonly message: string;
}

export type PlaybackPlanReason =
  | 'compile-rejected'
  | 'missing-required'
  | 'disabled'
  | 'reduced'
  | 'all-optional-skipped'
  | 'empty-tracks'
  | 'zero-duration';

export type PublishableStable<T extends TargetSchema = TargetSchema> = {
  readonly [K in keyof T]?: StableProjection<T>[K];
};

export interface PlayDecision<T extends TargetSchema = TargetSchema> {
  readonly kind: 'play';
  readonly compiled: CompiledMotion<T>;
  readonly publishable: PublishableStable<T>;
  readonly stable: StableProjection<T>;
}

export interface StableOnlyCompileRejectedDecision<T extends TargetSchema = TargetSchema> {
  readonly kind: 'stable-only';
  readonly reason: 'compile-rejected';
  readonly publishable: PublishableStable<T>;
  readonly stable: StableProjection<T>;
  readonly diagnostic: PlaybackErrorDiagnostic;
  readonly error: PlaybackErrorDiagnostic;
  readonly compiled?: undefined;
}

export interface StableOnlyClassifiedDecision<T extends TargetSchema = TargetSchema> {
  readonly kind: 'stable-only';
  readonly reason: Exclude<PlaybackPlanReason, 'compile-rejected'>;
  readonly publishable: PublishableStable<T>;
  readonly stable: StableProjection<T>;
  readonly compiled: CompiledMotion<T>;
  readonly diagnostic?: undefined;
  readonly error?: undefined;
}

export type StableOnlyDecision<T extends TargetSchema = TargetSchema> =
  | StableOnlyCompileRejectedDecision<T>
  | StableOnlyClassifiedDecision<T>;

export type PlaybackDecision<T extends TargetSchema = TargetSchema> =
  | PlayDecision<T>
  | StableOnlyDecision<T>;

export interface PlaybackRequest<T extends TargetSchema = TargetSchema, S extends string = string> {
  readonly from: NoInfer<S>;
  readonly to: NoInfer<S>;
  readonly availableTargets?: readonly (keyof T & string)[] | undefined;
  readonly theme?: TokenOverrides | undefined;
  readonly preset?: TokenOverrides | undefined;
  readonly instance?: TokenOverrides | undefined;
  readonly reducedMotion?: boolean | undefined;
}

function toBoundedDiagnostic(err: unknown): PlaybackErrorDiagnostic {
  let name = 'Error';
  let message = 'Motion compilation rejected';
  if (err !== null && typeof err === 'object') {
    try {
      const rawName = (err as { name?: unknown }).name;
      if (typeof rawName === 'string' && rawName.length > 0) {
        name = rawName.slice(0, 128);
      }
    } catch {
      // Guard against throwing name accessor
    }
    try {
      const rawMessage = (err as { message?: unknown }).message;
      if (typeof rawMessage === 'string') {
        message = rawMessage.slice(0, 1024);
      }
    } catch {
      // Guard against throwing message accessor
    }
  } else if (typeof err === 'string') {
    message = err.slice(0, 1024);
  }
  return Object.freeze({ name, message });
}

function publishableStable<T extends TargetSchema, S extends string, N extends NumericDescriptors>(
  recipe: MotionRecipe<T, S, N>,
  stable: StableProjection<T>,
  availableTargets: readonly (keyof T & string)[] | undefined
): PublishableStable<T> {
  let available: Set<unknown> | undefined;
  if (availableTargets !== undefined) {
    try {
      available = new Set(availableTargets);
    } catch {
      available = undefined;
    }
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const target of Object.keys(recipe.targets)) {
    if (available === undefined || available.has(target)) {
      result[target] = (stable as Record<string, unknown>)[target];
    }
  }
  return Object.freeze(result) as PublishableStable<T>;
}

/**
 * Pure playback planner.
 *
 * Boundary semantics:
 * Only the destination (`to`) state is a hard programmer-error boundary (validated
 * upfront via `stableProjection`) because it determines the final stable state.
 * An invalid source (`from`) state with a valid destination state is rejected during
 * compilation and safely degrades to a `compile-rejected` stable-only fallback,
 * preserving the destination stable projection.
 *
 * Diagnostic handling:
 * Diagnostics belong to the renderer / presentation coordination layer for logging
 * and inspection; they are not retained in feature reducer state.
 */
export function planPlayback<
  T extends TargetSchema,
  S extends string,
  N extends NumericDescriptors = NumericDescriptors
>(
  recipe: MotionRecipe<T, S, N>,
  request: PlaybackRequest<T, S>
): PlaybackDecision<T> {
  const safeRequest = visualCopy(request);
  exactKeys(
    safeRequest,
    ['from', 'to', 'availableTargets', 'theme', 'preset', 'instance', 'reducedMotion'],
    'playback request'
  );

  const destination = safeRequest.to;
  const stable = stableProjection(recipe, destination);
  const publishable = publishableStable(recipe, stable, safeRequest.availableTargets);

  let compiled: CompiledMotion<T>;
  try {
    compiled = compileMotion(recipe, safeRequest);
  } catch (err: unknown) {
    const diagnostic = toBoundedDiagnostic(err);
    return Object.freeze({
      kind: 'stable-only',
      reason: 'compile-rejected',
      publishable,
      stable,
      diagnostic,
      error: diagnostic,
    });
  }

  if (compiled.outcome === 'stable-fallback' || compiled.missingRequired.length > 0) {
    return Object.freeze({
      kind: 'stable-only',
      reason: 'missing-required',
      compiled,
      publishable,
      stable,
    });
  }

  if (compiled.tokens.disabled) {
    return Object.freeze({
      kind: 'stable-only',
      reason: 'disabled',
      compiled,
      publishable,
      stable,
    });
  }

  if (compiled.tokens.reduced) {
    return Object.freeze({
      kind: 'stable-only',
      reason: 'reduced',
      compiled,
      publishable,
      stable,
    });
  }

  if (compiled.tracks.length === 0) {
    return Object.freeze({
      kind: 'stable-only',
      reason: compiled.skippedOptional.length > 0 ? 'all-optional-skipped' : 'empty-tracks',
      compiled,
      publishable,
      stable,
    });
  }

  if (compiled.durationMs === 0) {
    return Object.freeze({
      kind: 'stable-only',
      reason: 'zero-duration',
      compiled,
      publishable,
      stable,
    });
  }

  return Object.freeze({
    kind: 'play',
    compiled,
    publishable,
    stable,
  });
}

export const planMotionPlayback = planPlayback;
