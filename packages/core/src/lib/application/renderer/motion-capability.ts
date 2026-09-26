import type { CompiledTrack } from '../motion/compiler.js';
import type { MotionProperty, NormalizedValue } from '../motion/properties.js';
import type { MotionTrackSpec } from './motion-engine.js';
import { planTransformMix, type TransformMixFallbackReason } from './transform-mix.js';

export type PairCapabilityFallbackReason =
  | 'kind-mismatch'
  | 'unit-mismatch'
  | 'arity'
  | `transform:${TransformMixFallbackReason}`;

export type PairCapability =
  | { readonly kind: 'play' }
  | { readonly kind: 'identity' }
  | { readonly kind: 'fallback'; readonly reason: PairCapabilityFallbackReason };

export interface EngineTrackSpec extends MotionTrackSpec {
  readonly target: string;
}

export interface EnginePropertyFallback {
  readonly target: string;
  readonly property: MotionProperty;
  readonly reason: PairCapabilityFallbackReason;
}

export interface ResolvedEnginePlan {
  readonly tracks: readonly EngineTrackSpec[];
  readonly fallbacks: readonly EnginePropertyFallback[];
}

export function resolvePairCapability(from: NormalizedValue, to: NormalizedValue): PairCapability {
  // 1. from.css === to.css gives identity. This includes equal arbitrary or 3D transform strings.
  if (from.css === to.css) {
    return { kind: 'identity' };
  }

  // 2. A kind or unit mismatch gives fallback.
  if (from.kind !== to.kind) {
    return { kind: 'fallback', reason: 'kind-mismatch' };
  }
  if (from.unit !== to.unit) {
    return { kind: 'fallback', reason: 'unit-mismatch' };
  }

  // 3. Number and length need one value and color needs four; anything else gives arity.
  if (from.kind === 'number' || from.kind === 'length') {
    if (from.values.length !== 1 || to.values.length !== 1) {
      return { kind: 'fallback', reason: 'arity' };
    }
  } else if (from.kind === 'color') {
    if (from.values.length !== 4 || to.values.length !== 4) {
      return { kind: 'fallback', reason: 'arity' };
    }
  }

  // 4. Transform delegates to planTransformMix.
  if (from.kind === 'transform') {
    const plan = planTransformMix(from.css, to.css);
    if (plan.kind === 'identity') {
      return { kind: 'identity' };
    }
    if (plan.kind === 'mix') {
      if (plan.from === plan.to) {
        return { kind: 'identity' };
      }
      return { kind: 'play' };
    }
    return { kind: 'fallback', reason: `transform:${plan.reason}` };
  }

  return { kind: 'play' };
}

export function resolveEnginePlan(compiled: { readonly tracks: readonly CompiledTrack[] }): ResolvedEnginePlan {
  const tracks: EngineTrackSpec[] = [];
  const fallbacks: EnginePropertyFallback[] = [];

  for (const track of compiled.tracks) {
    // Instant properties (startMs === 0 && durationMs === 0) require no interpolation
    // and do not call pair capability.
    if (track.startMs === 0 && track.durationMs === 0) {
      continue;
    }
    for (const prop of track.properties) {
      const capability = resolvePairCapability(prop.from, prop.to);
      if (capability.kind === 'play') {
        tracks.push(Object.freeze({
          target: track.target,
          property: prop.property,
          from: prop.from,
          to: prop.to,
          startMs: track.startMs,
          durationMs: track.durationMs,
          easing: track.easing,
        }));
      } else if (capability.kind === 'fallback') {
        fallbacks.push(Object.freeze({
          target: track.target,
          property: prop.property,
          reason: capability.reason,
        }));
      }
      // Identity properties are omitted without a fallback diagnostic.
    }
  }

  return Object.freeze({
    tracks: Object.freeze(tracks),
    fallbacks: Object.freeze(fallbacks),
  });
}
