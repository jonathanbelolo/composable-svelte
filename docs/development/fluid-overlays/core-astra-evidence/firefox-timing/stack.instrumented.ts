/**
 * Continuation of animations the projection could not replay exactly, without touching their source.
 *
 * Available visual state (reads only, while the source lives): each animation's specified keyframes (implicit
 * keyframes omitted by engines for script-created animations), timing, composite modes, per-keyframe easing,
 * current time and playback rate, and the element's composited computed value. Not available from any API:
 * the underlying (non-animated) value the stack composes onto.
 *
 * Method: replay the element's own stack (original keyframes, composite and iteration composite, keyframe
 * easing, timing) on *our copy*, evaluate it at the sampled times with a candidate underlying value, and accept
 * the candidate only if the copy's computed value matches the sampled source value exactly. Scalar underlying
 * values (numbers, px, colours) are solved from two evaluations (the value is affine in the underlying value for
 * replace/add/accumulate composition); other types are verified from candidates (`none`, `initial`, and the
 * static value of an unanimated shallow clone of ours). Evaluation happens synchronously on the copy (no paint).
 * Unmatched properties stay reported as `animationFrozen` (open work), never claimed live.
 */
import { parseAnimatable } from './reconstruct.js';

export interface StackSample { readonly at: number; readonly values: readonly string[]; readonly times: ReadonlyMap<Animation, number | null> }
export interface StackTrack { readonly source: Element; readonly copy: Element & ElementCSSInlineStyle; readonly properties: readonly string[]; readonly animations: readonly Animation[] }
export interface StackResult { readonly solved: ReadonlySet<string>; readonly replays: readonly Animation[]; readonly frozen: readonly string[]; readonly reasons: readonly string[] }

const NO_MIRROR = new Set(['iframe', 'video', 'audio', 'img', 'picture', 'source', 'object', 'embed', 'script', 'link', 'canvas', 'style', 'template']);
const numbers = (text: string) => (text.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
function same(a: string, b: string): boolean {
  if (a === b) return true;
  const x = numbers(a), y = numbers(b);
  return x.length > 0 && x.length === y.length && a.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, '#') === b.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, '#') && x.every((v, i) => Math.abs(v - y[i]!) <= 1e-3 * Math.max(1, Math.abs(v)));
}
function formatLike(template: string, values: readonly number[]): string {
  let index = 0;
  return template.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, () => { const v = values[index++]!; return String(Math.round(v * 1e6) / 1e6); });
}
function mirrorStatic(source: Element, property: string, host: HTMLElement): string | undefined {
  if (source.localName.includes('-') || NO_MIRROR.has(source.localName)) return undefined;
  const clone = source.cloneNode(false) as Element & ElementCSSInlineStyle;
  clone.removeAttribute('id');
  clone.style?.setProperty('animation', 'none', 'important');
  clone.style?.setProperty('transition', 'none', 'important');
  host.appendChild(clone);
  try { return getComputedStyle(clone).getPropertyValue(property) || undefined; } finally { clone.remove(); }
}

export function reconstructStack(track: StackTrack, samples: readonly StackSample[], now: number): StackResult {
  const all = [...track.properties];
  const sample = samples[samples.length - 1];
  if (!sample) return { solved: new Set(), replays: [], frozen: all, reasons: ['noSample'] };
  const doc = track.copy.ownerDocument;
  const reasons: string[] = [];
  if (track.animations.some(animation => animation.timeline !== doc.timeline)) return { solved: new Set(), replays: [], frozen: all, reasons: ['nonDocumentTimeline'] };
  const existing = track.copy.getAnimations();
  const trials: { readonly source: Animation; readonly replay: Animation }[] = [];
  for (const animation of track.animations) {
    const effect = animation.effect as KeyframeEffect | null;
    if (!effect) continue;
    const frames = effect.getKeyframes().map(frame => { const out: Record<string, unknown> = {}; for (const [key, value] of Object.entries(frame)) if (key !== 'computedOffset') out[key] = value; return out as Keyframe; });
    // An idle animation with a hold time (no pending play/pause): evaluations see the time set, synchronously.
    const replayEffect = new KeyframeEffect(track.copy as Element, frames, { ...effect.getTiming(), composite: effect.composite, iterationComposite: effect.iterationComposite } as KeyframeEffectOptions);
    const replay = new Animation(replayEffect, doc.timeline);
    trials.push({ source: animation, replay });
  }
  const host = doc.createElement('div');
  host.setAttribute('aria-hidden', 'true'); host.setAttribute('data-composable-visual-internal', ''); host.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
  (doc.body ?? doc.documentElement).appendChild(host);
  /**
   * Evaluate the replayed stack on the copy at a sample's times shifted by `delta` ms. Some engines report an
   * animation current time that differs by a small constant from the time their computed style reflects; the
   * offset is part of the solution and must explain every sample exactly (verified), never assumed.
   */
  const evaluateAt = (at: StackSample, delta: number, property: string, candidate: string): string => {
    const prior = track.copy.style.getPropertyValue(property);
    const saved = existing.map(animation => animation.currentTime);
    try {
      track.copy.style.setProperty(property, candidate);
      for (const { source, replay } of trials) replay.currentTime = (at.times.get(source) ?? 0) + delta;
      existing.forEach((animation, index) => { const t = saved[index]; if (typeof t === 'number') animation.currentTime = t - (now - at.at) * animation.playbackRate + delta; });
      return getComputedStyle(track.copy).getPropertyValue(property);
    } finally {
      existing.forEach((animation, index) => { animation.currentTime = saved[index] ?? null; });
      if (prior) track.copy.style.setProperty(property, prior); else track.copy.style.removeProperty(property);
    }
  };
  const bases = new Map<string, string>();
  let offset = 0;
  const solveAt = (delta: number): Map<string, string> | undefined => {
    const found = new Map<string, string>();
    // Exact up to the engines' current-time resolution: the tolerance is the value change ±1 ms of animation time
    // produces at that sample (derived per component, not a fixed allowance).
    const explains = (property: string, index: number, candidate: string) => samples.every(at => {
      const shown = evaluateAt(at, delta, property, candidate), target = at.values[index]!;
      if (same(shown, target)) return true;
      const x = numbers(shown), y = numbers(target), before = numbers(evaluateAt(at, delta - 1, property, candidate)), after = numbers(evaluateAt(at, delta + 1, property, candidate));
      if (!x.length || x.length !== y.length || before.length !== x.length || after.length !== x.length || shown.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, '#') !== target.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, '#')) return false;
      return x.every((v, i) => Math.abs(v - y[i]!) <= Math.max(1e-3, Math.abs(after[i]! - v), Math.abs(v - before[i]!)));
    });
    for (const [index, property] of track.properties.entries()) {
      const target = sample.values[index]!;
      const parsed = parseAnimatable(target);
      let accepted: string | undefined;
      if (parsed) {
        // Affine in the underlying value: two evaluations give the solution; every sample verifies it exactly.
        const b0 = numbers(target), step = parsed.kind === 'color' ? [16, 16, 16, 0] : parsed.kind === 'px' ? [10] : [1];
        const b1 = b0.map((v, i) => v + (step[i] ?? 0));
        const v0 = numbers(evaluateAt(sample, delta, property, target)), v1 = numbers(evaluateAt(sample, delta, property, formatLike(target, b1)));
        if (v0.length === b0.length && v1.length === b0.length) {
          const solved = b0.map((b, i) => { const slope = (v1[i]! - v0[i]!) / ((b1[i]! - b) || 1); return Math.abs(slope) < 1e-9 ? b : b + (b0[i]! - v0[i]!) / slope; });
          const candidate = formatLike(target, solved);
          if (explains(property, index, candidate)) accepted = candidate;
        }
      }
      if (!accepted) for (const candidate of ['none', 'initial', mirrorStatic(track.source, property, host)].filter((value): value is string => !!value)) if (explains(property, index, candidate)) { accepted = candidate; break; }
      if (!accepted) return undefined;
      found.set(property, accepted);
    }
    return found;
  };
  try {
    // Offset 0 first; if the samples are unexplained, a bounded ±40 ms constant offset of the replay is searched.
    // (P11: source current time equals style time in all engines; the offset compensates replay evaluation, which
    // measurably improves Firefox 142 — see the implementation report.)
    const deltas = [0, ...Array.from({ length: 40 }, (_, i) => [i + 1, -(i + 1)]).flat()];
    for (const delta of samples.length > 1 ? deltas : [0]) { const found = solveAt(delta); if (found) { for (const [k, v] of found) bases.set(k, v); offset = delta; break; } }
    if (!bases.size) reasons.push(...track.properties.map(property => `unmatched:${property}`));
    if (offset) reasons.push(`timeOffset:${offset}`);
  } finally { host.remove(); }
  console.info('[astra-stack-solve]', JSON.stringify({properties:all,offset,bases:[...bases],reasons,samples:samples.map(s=>({at:s.at,values:s.values,times:[...s.times.values()]})),timeline:doc.timeline.currentTime,sourceTimes:track.animations.map(a=>({time:a.currentTime,start:a.startTime,playState:a.playState}))}));
  const frozen = all.filter(property => !bases.has(property));
  if (frozen.length) { for (const { replay } of trials) replay.cancel(); return { solved: new Set(), replays: [], frozen: all, reasons }; }
  // Accepted: the copy carries the solved underlying values and continues the stack from the current times.
  for (const [property, value] of bases) track.copy.style.setProperty(property, value);
  for (const { source, replay } of trials) {
    const time = sample.times.get(source);
    replay.playbackRate = source.playbackRate;
    const at = typeof time === 'number' ? time + offset + (source.playState === 'running' ? (now - sample.at) * source.playbackRate : 0) : 0;
    if (source.playState === 'running') {
      // Time-locked to the source on the same timeline: its own start time (read only), shifted by any solved
      // offset. No wall-clock extrapolation and no pending play.
      const start = source.startTime;
      const timeline = doc.timeline.currentTime;
      if (typeof start === 'number') replay.startTime = start - offset / (source.playbackRate || 1);
      else if (typeof timeline === 'number') replay.startTime = timeline - at / (source.playbackRate || 1);
      else { replay.currentTime = at; replay.play(); }
    } else { replay.currentTime = at; replay.pause(); }
  }
  return { solved: new Set(all), replays: trials.map(trial => trial.replay), frozen: [], reasons };
}
