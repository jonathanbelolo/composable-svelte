/**
 * Reusable per-frame motion recorder.
 * Captures raw frame timestamps, geometry, computed style, focus, and real hitbox evidence per frame.
 *
 * Sampling phase (see ./checkpoint.ts):
 * - 'renderingCheckpoint' (default): after every rAF callback of the frame, before paint. Samples
 *   include runtime writes made in rAF callbacks regardless of registration order.
 * - 'animationFrame': in the recorder's own rAF callback. Callbacks run in registration order, so
 *   the sample excludes writes by rAF callbacks registered later (e.g. a route host started after
 *   the recorder). Kept for comparison and positive controls; not frame-state evidence.
 * Neither phase observes compositor output.
 */
import { startRenderingCheckpoints, type RenderingCheckpointLoop, type SamplePhase } from './checkpoint.js';
import { observeElement, resolveElement, type ElementQuery } from './observe.js';
import type { ElementObservation, FrameRecordResult, FrameSample } from './types.js';

export interface MotionRecorderOptions {
  /** Maximum number of frames to retain in memory (bounded retention). Default 300. */
  maxFrames?: number;
  /** Named element queries: selector string, Element instance, or getter function returning Element | null */
  targets: Record<string, ElementQuery>;
  /** Frame sampling phase. Default 'renderingCheckpoint' (added in harness correction). */
  phase?: Exclude<SamplePhase, 'manual'>;
}

export interface MotionRecorder {
  /** Live buffer of recorded frames */
  readonly frames: readonly FrameSample[];
  readonly isRecording: boolean;
  readonly isTruncated: boolean;
  readonly phase: Exclude<SamplePhase, 'manual'>;
  /** Sampling error that stopped the recorder, if any */
  readonly error: string | undefined;
  /** Samples the targets now, at a caller-chosen checkpoint. Not stored in `frames`. */
  sampleNow(): FrameSample;
  stop(): FrameRecordResult;
  dispose(): void;
}

export function startMotionRecorder(options: MotionRecorderOptions): MotionRecorder {
  const maxFrames = options.maxFrames ?? 300;
  const phase = options.phase ?? 'renderingCheckpoint';
  const targetEntries = Object.entries(options.targets);

  const samples: FrameSample[] = [];
  let isRecording = true;
  let isTruncated = false;
  let error: string | undefined;
  let rafId: number | undefined;
  let checkpoints: RenderingCheckpointLoop | undefined;
  let frameCount = 0;

  const observeTargets = (): Record<string, ElementObservation> => {
    const elements: Record<string, ElementObservation> = {};
    for (const [name, query] of targetEntries) {
      let el: Element | null;
      try {
        el = resolveElement(query);
      } catch {
        // A throwing target query means "absent", as before.
        el = null;
      }
      elements[name] = observeElement(el);
    }
    return elements;
  };

  const halt = () => {
    isRecording = false;
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
      rafId = undefined;
    }
    checkpoints?.stop();
  };

  const sampleFrame = (time: number) => {
    if (!isRecording) return;
    if (samples.length >= maxFrames) {
      isTruncated = true;
      halt();
      return;
    }
    try {
      // Raw frame timestamp is kept as evidence; diagnostics detect invalid order.
      samples.push({ time, frameIndex: frameCount++, elements: observeTargets(), phase });
    } catch (cause) {
      error = cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause);
      halt();
    }
  };

  if (phase === 'renderingCheckpoint') {
    checkpoints = startRenderingCheckpoints(sampleFrame);
  } else {
    const loop = (time: number) => {
      rafId = undefined;
      sampleFrame(time);
      if (isRecording) rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  const stop = (): FrameRecordResult => {
    halt();
    return {
      frames: [...samples],
      truncated: isTruncated,
      maxFrames,
      recordedCount: samples.length,
      phase,
      missedCheckpoints: checkpoints?.missed ?? 0,
      ...(error === undefined ? {} : { error })
    };
  };

  return {
    get frames() {
      return samples;
    },
    get isRecording() {
      return isRecording;
    },
    get isTruncated() {
      return isTruncated;
    },
    get error() {
      return error;
    },
    phase,
    sampleNow() {
      return { time: performance.now(), frameIndex: -1, elements: observeTargets(), phase: 'manual' };
    },
    stop,
    dispose() {
      stop();
      samples.length = 0;
    }
  };
}
