/**
 * Non-mutating reconstruction of animations the projection could not replay exactly (P8: script-created WAAPI
 * animations with implicit keyframes expose no underlying value). While the source lives, the run samples each
 * followed animation's displayed value and its computed progress (reads only). At retirement the implicit
 * keyframe's underlying value is solved from a sample, the keyframes are made explicit, and the animation is
 * replayed on the copy from its current time: it keeps running after its owner retires.
 * Solvable: a single replace-composited animation of the property on that element, one segment ending or
 * starting at the implicit keyframe, values that are numbers, px lengths or rgb()/rgba() colours, with a
 * sample whose progress is not at the explicit end. Anything else stays reported as `animationFrozen`.
 */
export interface AnimationSample { readonly value: string; readonly progress: number | null; readonly currentTime: number | null; readonly at: number }
type Parsed = { readonly kind: 'number' | 'px'; readonly values: readonly number[] } | { readonly kind: 'color'; readonly values: readonly number[] };
const COLOR = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/;
export function parseAnimatable(value: string): Parsed | undefined {
  const text = value.trim();
  if (/^-?\d*\.?\d+(e-?\d+)?$/i.test(text)) return { kind: 'number', values: [Number(text)] };
  const px = /^(-?\d*\.?\d+(?:e-?\d+)?)px$/i.exec(text);
  if (px) return { kind: 'px', values: [Number(px[1])] };
  const color = COLOR.exec(text);
  if (color) return { kind: 'color', values: [Number(color[1]), Number(color[2]), Number(color[3]), color[4] === undefined ? 1 : Number(color[4])] };
  return undefined;
}
const format = (parsed: Parsed, values: readonly number[]) => parsed.kind === 'number' ? String(values[0]) : parsed.kind === 'px' ? `${values[0]}px` : `rgba(${values.slice(0, 3).map(v => Math.round(Math.min(255, Math.max(0, v)))).join(', ')}, ${Math.min(1, Math.max(0, values[3]!))})`;
/** Normalize a specified keyframe value to its computed form (colours) using a scratch element of ours. */
function computed(property: string, value: string, scratch: HTMLElement): string {
  scratch.style.setProperty(property, value);
  const out = getComputedStyle(scratch).getPropertyValue(property);
  scratch.style.removeProperty(property);
  return out || value;
}
/**
 * Build explicit keyframes for `animation` from a displayed-value sample, or undefined when not solvable.
 * `property` is the CSS property name; `sample` was read from the source (never mutated).
 */
export function solveImplicit(animation: Animation, property: string, sample: AnimationSample, scratch: HTMLElement): Keyframe[] | undefined {
  const effect = animation.effect as KeyframeEffect | null;
  if (!effect || (effect.composite ?? 'replace') !== 'replace' || sample.progress === null) return undefined;
  const frames = effect.getKeyframes();
  const camel = property.replace(/-([a-z])/g, (_m, letter: string) => letter.toUpperCase());
  const keyed = frames.filter(frame => camel in frame || property in frame);
  if (keyed.length !== 1 || frames.some(frame => frame.composite && frame.composite !== 'auto' && frame.composite !== 'replace')) return undefined;
  const explicit = keyed[0]!;
  const offset = explicit.computedOffset ?? 1;
  if (offset !== 0 && offset !== 1) return undefined;
  if ((explicit.easing ?? 'linear') !== 'linear') return undefined;
  const specified = String((explicit as Record<string, unknown>)[camel] ?? (explicit as Record<string, unknown>)[property]);
  const endText = computed(property, specified, scratch);
  const end = parseAnimatable(endText), shown = parseAnimatable(sample.value);
  if (!end || !shown || end.kind !== shown.kind || end.values.length !== shown.values.length) return verifyCandidates(property, specified, offset, sample, scratch);
  // Displayed = base + (end - base) * p for an implicit start (offset 1 explicit); base + (end - base) * (1 - p) otherwise.
  const weight = offset === 1 ? sample.progress : 1 - sample.progress;
  if (!(weight < 0.98)) return undefined;
  const base = shown.values.map((v, index) => (v - end.values[index]! * weight) / (1 - weight));
  if (base.some(value => !Number.isFinite(value))) return undefined;
  const baseText = format(shown, base);
  const endFrame = { [property]: endText, offset } as Keyframe;
  const baseFrame = { [property]: baseText, offset: 1 - offset } as Keyframe;
  return offset === 1 ? [baseFrame, endFrame] : [endFrame, baseFrame];
}

/**
 * Non-scalar values (transforms, filters, shadows…): test candidate underlying values by evaluating the same
 * interpolation on a scratch element of ours at the sampled progress; accept only an exact match of the
 * displayed computed value (strings, or matrices within 1e-3). Candidates: `none`, `initial`.
 */
function verifyCandidates(property: string, specified: string, offset: number, sample: AnimationSample, scratch: HTMLElement): Keyframe[] | undefined {
  if (sample.progress === null) return undefined;
  const numbers = (text: string) => (text.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number);
  const same = (a: string, b: string) => { if (a === b) return true; const x = numbers(a), y = numbers(b); return x.length > 0 && x.length === y.length && a.replace(/[-\d.e]+/gi, '#') === b.replace(/[-\d.e]+/gi, '#') && x.every((v, i) => Math.abs(v - y[i]!) < 1e-3); };
  for (const candidate of ['none', 'initial']) {
    const frames: Keyframe[] = offset === 1 ? [{ [property]: candidate, offset: 0 } as Keyframe, { [property]: specified, offset: 1 } as Keyframe] : [{ [property]: specified, offset: 0 } as Keyframe, { [property]: candidate, offset: 1 } as Keyframe];
    let probe: Animation | undefined;
    try {
      probe = scratch.animate(frames, { duration: 1000, fill: 'both', easing: 'linear' });
      probe.pause(); probe.currentTime = sample.progress * 1000;
      const value = getComputedStyle(scratch).getPropertyValue(property);
      if (same(value, sample.value)) return frames;
    } catch { /* candidate not interpolable */ }
    finally { probe?.cancel(); }
  }
  return undefined;
}
