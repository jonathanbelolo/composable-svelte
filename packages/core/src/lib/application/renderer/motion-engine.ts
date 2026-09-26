import { animate, motionValue, type MotionValue as MotionCoreValue } from 'motion';
import type { Easing } from '../motion/tokens.js';
import type { MotionProperty, NormalizedValue } from '../motion/properties.js';
import { planTransformMix, TransformMixError } from './transform-mix.js';

export type EngineSettlement =
  | { readonly status: 'completed' }
  | { readonly status: 'stopped' }
  | { readonly status: 'failed'; readonly error: unknown };

export interface MotionEngineHandle {
  stop(): void;
  readonly settled: Promise<EngineSettlement>;
}

export interface MotionTrackSpec {
  readonly property: MotionProperty;
  readonly from: NormalizedValue;
  readonly to: NormalizedValue;
  readonly startMs: number;
  readonly durationMs: number;
  readonly easing: Easing;
}

type CubicBezier = [number, number, number, number];

function easingFor(easing: Easing): CubicBezier | 'linear' {
  switch (easing) {
    case 'linear': return 'linear';
    case 'ease': return [0.25, 0.1, 0.25, 1];
    case 'ease-in': return [0.42, 0, 1, 1];
    case 'ease-out': return [0, 0, 0.58, 1];
    case 'ease-in-out': return [0.42, 0, 0.58, 1];
    default: {
      const _exhaustive: never = easing;
      throw new TypeError(`Unsupported easing ${String(_exhaustive)}`);
    }
  }
}

/** Exact decimal expansion of the shortest round-trip form; no digit is dropped. */
function formatNumberNoExp(n: number): string {
  if (!Number.isFinite(n)) throw new TypeError('Motion engine values must be finite');
  if (n === 0) return '0';
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(String(n));
  if (!match) return String(n);
  const sign = match[1] ?? '';
  const whole = match[2] ?? '';
  const digits = whole + (match[3] ?? '');
  const point = whole.length + Number(match[4]);
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return `${sign}${digits}${'0'.repeat(point - digits.length)}`;
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

function formatRgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${formatNumberNoExp(r)}, ${formatNumberNoExp(g)}, ${formatNumberNoExp(b)}, ${formatNumberNoExp(a)})`;
}

export function playMotionValue(
  track: MotionTrackSpec,
  write: (value: string) => void,
): MotionEngineHandle {
  let settlePromise: (result: EngineSettlement) => void;
  const settled = new Promise<EngineSettlement>((resolve) => {
    settlePromise = resolve;
  });

  let open = true;
  let currentWrite: ((value: string) => void) | null = write;
  let controlRef: { stop(): void } | null = null;
  let valueRef: { stop(): void } | null = null;

  const close = (outcome: EngineSettlement): void => {
    if (!open) return;
    open = false;
    currentWrite = null;
    settlePromise(outcome);
  };

  const halt = (): void => {
    const live = controlRef;
    const value = valueRef;
    controlRef = null;
    valueRef = null;
    if (live) {
      try {
        live.stop();
      } catch {
        try {
          value?.stop();
        } catch {}
      }
    } else {
      try {
        value?.stop();
      } catch {}
    }
  };

  const fail = (error: unknown): void => {
    close({ status: 'failed', error });
    halt();
  };

  if (track.from.kind !== track.to.kind || track.from.unit !== track.to.unit) {
    close({ status: 'failed', error: new Error(`Kind or unit mismatch between from (${track.from.kind}:${track.from.unit}) and to (${track.to.kind}:${track.to.unit})`) });
    return {
      stop() {},
      settled,
    };
  }

  // Zero-work contract: durationMs === 0 && startMs === 0 completes synchronously
  // with no writer call. Exact destination publication is the future adapter's responsibility.
  if (track.durationMs === 0 && track.startMs === 0) {
    close({ status: 'completed' });
    return {
      stop() {},
      settled,
    };
  }

  const kind = track.from.kind;
  const unit = track.from.unit;

  const stop = (): void => {
    if (!open) return;
    close({ status: 'stopped' });
    halt();
  };

  try {
    const duration = track.durationMs / 1000;
    const delay = track.startMs / 1000;
    if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(delay) || delay < 0) {
      throw new RangeError('Motion engine timing must be finite and nonnegative');
    }
    if (kind !== 'transform') {
      const arity = kind === 'color' ? 4 : 1;
      if (track.from.values.length !== arity || track.to.values.length !== arity) {
        throw new TypeError(`Motion engine ${kind} values require ${arity} component(s)`);
      }
    }
    const ease = easingFor(track.easing);
    const publish = <V>(format: (latest: V) => string) => (latest: V): void => {
      const sink = currentWrite;
      if (!open || !sink) return;
      try {
        sink(format(latest));
      } catch (err) {
        fail(err);
      }
    };

    let control: { stop(): void; readonly finished: Promise<unknown> };
    if (kind === 'transform') {
      const plan = planTransformMix(track.from.css, track.to.css);
      if (plan.kind === 'fallback') throw new TransformMixError(plan.reason);
      if (plan.kind === 'identity') {
        close({ status: 'completed' });
        return { stop, settled };
      }
      const mv: MotionCoreValue<string> = motionValue(plan.from);
      valueRef = mv;
      control = animate(mv, [plan.from, plan.to], {
        duration,
        delay,
        ease,
        onUpdate: publish<string>((latest) => {
          if (typeof latest !== 'string' || !plan.emitted.test(latest)) throw new TransformMixError('emitted-shape');
          return latest;
        }),
      });
    } else if (kind === 'color') {
      const fromColor = formatRgba(track.from.values[0]!, track.from.values[1]!, track.from.values[2]!, track.from.values[3]!);
      const toColor = formatRgba(track.to.values[0]!, track.to.values[1]!, track.to.values[2]!, track.to.values[3]!);
      const mv: MotionCoreValue<string> = motionValue(fromColor);
      valueRef = mv;
      control = animate(mv, [fromColor, toColor], {
        duration,
        delay,
        ease,
        onUpdate: publish<string>((latest) => latest),
      });
    } else {
      const fromNum = track.from.values[0]!;
      const toNum = track.to.values[0]!;
      const suffix = unit === 'number' ? '' : unit;
      const mv: MotionCoreValue<number> = motionValue(fromNum);
      valueRef = mv;
      control = animate(mv, [fromNum, toNum], {
        duration,
        delay,
        ease,
        onUpdate: publish<number>((latest) => `${formatNumberNoExp(latest)}${suffix}`),
      });
    }

    controlRef = control;
    const finished = control.finished;
    if (!open) {
      void finished.then(() => {}, () => {});
      halt();
    } else {
      void finished.then(
        () => {
          close({ status: 'completed' });
          controlRef = null;
          valueRef = null;
        },
        (err: unknown) => fail(err),
      );
    }
  } catch (err) {
    close({ status: 'failed', error: err });
    halt();
  }

  return {
    stop,
    settled,
  };
}
