/**
 * Execution scheduler foundation for Composable Svelte.
 *
 * Provides minimal now(), setTimer(), clearTimer(), requestFrame(), cancelFrame()
 * operations with explicit timer and frame phases.
 *
 * Implements:
 * - ProductionScheduler: SSR-safe, resolves browser APIs at execution time (no import-time reads)
 * - DeterministicScheduler: deterministic time/frame authority for testing with due-time ordering,
 *   insertion-order tie breaking, and explicit frame advancement.
 */

export interface TimerHandle {
  readonly kind: 'timer';
  readonly id: unknown;
}

export interface FrameHandle {
  readonly kind: 'frame';
  readonly id: unknown;
}

export interface ExecutionScheduler {
  now(): number;
  setTimer(delay: number, callback: () => void): TimerHandle;
  clearTimer(handle: TimerHandle): void;
  requestFrame(callback: (time: number) => void): FrameHandle;
  cancelFrame(handle: FrameHandle): void;
}

export interface PendingTimerInfo {
  readonly handle: TimerHandle;
  readonly dueTime: number;
  readonly delayRemaining: number;
  readonly sequence: number;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

/** Normalize host integer delays; reject overflow consistently in both adapters. */
function timerDelay(delay: number): number {
  const value = finite(delay, 'delay');
  if (value > 2147483647) throw new RangeError('Timer delay exceeds 2147483647 milliseconds');
  return Math.max(0, Math.trunc(value));
}

export class ProductionScheduler implements ExecutionScheduler {
  private readonly timerCancels = new WeakMap<TimerHandle, () => void>();
  private clock: (() => number) | undefined;
  private readonly frameCancels = new WeakMap<FrameHandle, () => void>();
  private lastTime = -Infinity;
  private lastRawTime: number | undefined;
  private clockOffset = 0;
  now(): number {
    // Lazily choose one authority per instance; never compare epoch and relative clocks.
    this.clock ??= typeof globalThis.performance?.now === 'function'
      ? globalThis.performance.now.bind(globalThis.performance) : Date.now.bind(Date);
    const current = finite(this.clock(), 'clock time');
    if (this.lastRawTime !== undefined && current < this.lastRawTime) this.clockOffset += this.lastRawTime - current;
    this.lastRawTime = current;
    this.lastTime = Math.max(this.lastTime, current + this.clockOffset);
    return this.lastTime;
  }
  setTimer(delay: number, callback: () => void): TimerHandle {
    const handle: TimerHandle = { kind: 'timer', id: Symbol('timer') };
    const clear = globalThis.clearTimeout.bind(globalThis);
    const id = globalThis.setTimeout(() => { this.timerCancels.delete(handle); callback(); }, timerDelay(delay));
    this.timerCancels.set(handle, () => clear(id));
    return handle;
  }
  clearTimer(handle: TimerHandle): void {
    const clear = this.timerCancels.get(handle); this.timerCancels.delete(handle); clear?.();
  }
  requestFrame(callback: (time: number) => void): FrameHandle {
    const handle: FrameHandle = { kind: 'frame', id: Symbol('frame') };
    const fire = (time?: number) => { this.frameCancels.delete(handle); callback(time ?? this.now()); };
    if (typeof globalThis.requestAnimationFrame === 'function' && typeof globalThis.cancelAnimationFrame === 'function') {
      const cancel = globalThis.cancelAnimationFrame.bind(globalThis);
      const id = globalThis.requestAnimationFrame(fire);
      this.frameCancels.set(handle, () => cancel(id));
    } else {
      const clear = globalThis.clearTimeout.bind(globalThis);
      const id = globalThis.setTimeout(() => fire(), 16);
      this.frameCancels.set(handle, () => clear(id));
    }
    return handle;
  }
  cancelFrame(handle: FrameHandle): void {
    const cancel = this.frameCancels.get(handle);
    this.frameCancels.delete(handle);
    cancel?.();
  }
}

// Each runtime creates its own ProductionScheduler; clock authority is never process-global.

interface ScheduledTimer {
  readonly handle: TimerHandle;
  readonly dueTime: number;
  readonly sequence: number;
  readonly callback: () => void;
  cancelled: boolean;
}

interface ScheduledFrame {
  readonly handle: FrameHandle;
  readonly sequence: number;
  readonly callback: (time: number) => void;
  cancelled: boolean;
}

export class TimerStormError extends Error {
  constructor(limit: number) { super(`Timer callback limit ${limit} exceeded; pending work retained`); this.name = 'TimerStormError'; }
}
export interface DeterministicSchedulerOptions { maxCallbacksPerAdvance?: number | undefined }

export class DeterministicScheduler implements ExecutionScheduler {
  private _currentTime: number;
  private _sequenceNumber = 0;
  private _advancing = false;
  private _timers: ScheduledTimer[] = [];
  private _frames: ScheduledFrame[] = [];
  private _executingFrames: ScheduledFrame[] = [];

  private readonly callbackLimit: number;
  constructor(initialTime: number = 0, options: DeterministicSchedulerOptions = {}) {
    this.callbackLimit = options.maxCallbacksPerAdvance ?? 10000;
    if (!Number.isSafeInteger(this.callbackLimit) || this.callbackLimit < 1) throw new RangeError('maxCallbacksPerAdvance must be a positive safe integer');
    this._currentTime = finite(initialTime, 'initialTime');
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get pendingTimersCount(): number {
    return this._timers.filter((t) => !t.cancelled).length;
  }

  get pendingFramesCount(): number {
    return this._frames.filter((f) => !f.cancelled).length;
  }

  get nextDueTime(): number | undefined {
    const active = this._timers.filter((t) => !t.cancelled);
    return active.length > 0 ? active[0]!.dueTime : undefined;
  }

  now(): number {
    return this._currentTime;
  }

  setTimer(delay: number, callback: () => void): TimerHandle {
    const dueTime = finite(this._currentTime + timerDelay(delay), 'dueTime');
    const sequence = this._sequenceNumber++;
    const handle: TimerHandle = { kind: 'timer', id: Symbol('TimerHandle') };

    const timerEntry: ScheduledTimer = {
      handle,
      dueTime,
      sequence,
      callback,
      cancelled: false
    };

    let insertIndex = this._timers.length;
    for (let i = 0; i < this._timers.length; i++) {
      const existing = this._timers[i]!;
      if (
        timerEntry.dueTime < existing.dueTime ||
        (timerEntry.dueTime === existing.dueTime && timerEntry.sequence < existing.sequence)
      ) {
        insertIndex = i;
        break;
      }
    }
    this._timers.splice(insertIndex, 0, timerEntry);

    return handle;
  }

  clearTimer(handle: TimerHandle): void {
    for (const timer of this._timers) {
      if (timer.handle === handle) {
        timer.cancelled = true;
      }
    }
    this._timers = this._timers.filter((t) => !t.cancelled);
  }

  requestFrame(callback: (time: number) => void): FrameHandle {
    const sequence = this._sequenceNumber++;
    const handle: FrameHandle = { kind: 'frame', id: Symbol('FrameHandle') };

    this._frames.push({
      handle,
      sequence,
      callback,
      cancelled: false
    });

    return handle;
  }

  cancelFrame(handle: FrameHandle): void {
    for (const frame of [...this._frames, ...this._executingFrames]) {
      if (frame.handle === handle) {
        frame.cancelled = true;
      }
    }
    this._frames = this._frames.filter((f) => !f.cancelled);
  }

  getPendingTimers(): readonly PendingTimerInfo[] {
    return this._timers
      .filter((t) => !t.cancelled)
      .map((t) => ({
        handle: t.handle,
        dueTime: t.dueTime,
        delayRemaining: Math.max(0, t.dueTime - this._currentTime),
        sequence: t.sequence
      }));
  }

  /** One microtask checkpoint after each callback and at end; never claims to exhaust promise chains. */
  async advanceTime(ms: number): Promise<void> {
    if (this._advancing || this._executingFrames.length) throw new Error('Timer advancement cannot reenter');
    this._advancing = true;
    try {
    if (finite(ms, 'duration') < 0) {
      throw new Error(`[DeterministicScheduler] advanceTime called with negative duration: ${ms}`);
    }
    const targetTime = finite(this._currentTime + ms, 'targetTime');
    const errors: unknown[] = [];
    let callbacks = 0;

    while (this._timers.length > 0) {
      this._timers = this._timers.filter((t) => !t.cancelled);
      if (this._timers.length === 0) break;

      const nextTimer = this._timers[0]!;
      if (nextTimer.dueTime > targetTime) {
        break;
      }

      if (callbacks >= this.callbackLimit) {
        errors.push(new TimerStormError(this.callbackLimit));
        throwCallbackErrors(errors);
      }
      callbacks++;
      this._timers.shift();
      this._currentTime = Math.max(this._currentTime, nextTimer.dueTime);

      if (!nextTimer.cancelled) {
        try { nextTimer.callback(); } catch (error) { errors.push(error); }
        await Promise.resolve();
      }
    }

    this._currentTime = targetTime;
    await Promise.resolve();
    throwCallbackErrors(errors);
      } finally { this._advancing = false; }
  }

  /** Synchronous timer phase only; use advanceTime to checkpoint microtasks between callbacks. */
  advanceTimeSync(ms: number): void {
    if (this._advancing || this._executingFrames.length) throw new Error('Timer advancement cannot reenter');
    this._advancing = true;
    try {
    if (finite(ms, 'duration') < 0) {
      throw new Error(`[DeterministicScheduler] advanceTimeSync called with negative duration: ${ms}`);
    }
    const targetTime = finite(this._currentTime + ms, 'targetTime');
    const errors: unknown[] = [];
    let callbacks = 0;

    while (this._timers.length > 0) {
      this._timers = this._timers.filter((t) => !t.cancelled);
      if (this._timers.length === 0) break;

      const nextTimer = this._timers[0]!;
      if (nextTimer.dueTime > targetTime) {
        break;
      }

      if (callbacks >= this.callbackLimit) {
        errors.push(new TimerStormError(this.callbackLimit));
        throwCallbackErrors(errors);
      }
      callbacks++;
      this._timers.shift();
      this._currentTime = Math.max(this._currentTime, nextTimer.dueTime);

      if (!nextTimer.cancelled) {
        try { nextTimer.callback(); } catch (error) { errors.push(error); }
      }
    }

    this._currentTime = targetTime;
    throwCallbackErrors(errors);
      } finally { this._advancing = false; }
  }

  /** Frame advancement is a distinct phase; pending timers are not implicitly fired. */
  async stepFrame(time?: number): Promise<void> {
    this.stepFrameSync(time);
    // One microtask checkpoint, not a claim to exhaust arbitrary promise chains.
    await Promise.resolve();
  }

  stepFrameSync(time?: number): void {
    if (this._advancing || this._executingFrames.length) throw new Error('Frame advancement cannot reenter');
    const frameTime = finite(time ?? this._currentTime, 'frameTime');
    if (frameTime < this._currentTime) throw new RangeError('Frame time cannot move backward');
    if (this.nextDueTime !== undefined && this.nextDueTime < frameTime) throw new Error('Advance due timers before moving the frame clock');
    this._currentTime = frameTime;
    const pending = this._frames;
    this._frames = [];
    this._executingFrames = pending;
    const errors: unknown[] = [];
    try {
      for (const frame of pending) {
        if (!frame.cancelled) {
          try { frame.callback(frameTime); } catch (error) { errors.push(error); }
        }
      }
    } finally { this._executingFrames = []; }
    throwCallbackErrors(errors);
  }

}

export function createDeterministicScheduler(initialTime: number = 0, options?: DeterministicSchedulerOptions): DeterministicScheduler {
  return new DeterministicScheduler(initialTime, options);
}

/** Drain valid work first, then report every callback failure without swallowing secondary errors. */
function throwCallbackErrors(errors: unknown[]): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Multiple scheduler callbacks failed");
}
