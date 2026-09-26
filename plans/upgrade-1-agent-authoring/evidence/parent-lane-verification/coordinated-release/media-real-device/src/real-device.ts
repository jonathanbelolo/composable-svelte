/**
 * Bounded real-device Media M12 qualification harness.
 *
 * One user click runs three bounded cases against the real microphone and the
 * native MediaRecorder: standalone push-to-talk, standalone conversation, and
 * conversation under a living managed parent. Each case records ~1.2 s, accepts
 * a stop, and unmounts the VoiceInput view while that stop is still pending
 * inside the native recorder. The store (or managed parent) stays alive.
 *
 * Instrumentation is passive: every wrapper calls the native method first and
 * records afterwards, and recorder listeners are registered before the library
 * installs its own handlers. Nothing is delayed or reordered.
 *
 * Privacy: the transcription dependency is a local stub that reads only
 * `blob.size`. No Blob is retained, stores keep no action history, and network
 * APIs are blocked and counted. Only numbers, booleans and event names leave a case.
 *
 * Safety: an absolute watchdog stops every track a case acquired 2000 ms after
 * that case's first getUserMedia success, a grant that resolves after its case
 * closed is stopped immediately, and every case ends with a forced native stop
 * of its tracks (counted as a failure when it had anything to stop).
 */

import { mount, unmount, type ComponentProps } from 'svelte';
import { createStore, Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';
import {
  VoiceInput,
  voiceInputReducer,
  createInitialVoiceInputState,
  createVoiceInputAudioManager,
  getVoiceInputAudioManager,
  deleteVoiceInputAudioManager,
  type VoiceInputAction,
  type VoiceInputDependencies,
  type VoiceInputState
} from '@composable-svelte/media';
import corePackageJson from '@composable-svelte/core/package.json?raw';
import mediaPackageJson from '@composable-svelte/media/package.json?raw';

// --- PROVENANCE ---

export const PROVENANCE = {
  "status": "candidate-r3-core0.13.1-media0.5.0",
  "packages": [
    {
      "name": "@composable-svelte/core",
      "version": "0.13.1",
      "path": "/private/tmp/companion-runtime-release/archives-r3/composable-svelte-core-0.13.1.tgz",
      "sha256": "30e044e139e831033e06fdf626db979875efa2f7c29d72dece33a21db112d18b",
      "integrity": "sha512-b+Il+IqyrK4A7oRN/F5Z16XItAwZ0JBZaBefukX95Hx5VbVf26UvjE0tKpsR+WDKcCL7pP1gqo3y677CgjW1vA=="
    },
    {
      "name": "@composable-svelte/media",
      "version": "0.5.0",
      "path": "/private/tmp/companion-runtime-release/archives-r3/composable-svelte-media-0.5.0.tgz",
      "sha256": "c0bfa6528fb6cd3dc68f2769237d3053514f76f79bc5197316b230eb07b78298",
      "integrity": "sha512-p1xYL/9hkCfitPYkb5Ss5nYb60IOebLTzyFww43++alSW9yZc0fUMJqoTx8iduwEIvFMfaHQbS+9nkwF4ULeHg=="
    }
  ],
  "lockSha256": "6a3281a8ded2b5f702031f90c87b6ebe34f5bb701576709385d6d577f2ce8d69",
  "svelte": "5.55.3"
} as const;

function packageVersion(raw: string): string {
  try {
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === 'string' ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

const INSTALLED = { core: packageVersion(corePackageJson), media: packageVersion(mediaPackageJson) };

// --- BOUNDS ---

const CAPTURE_MS = 1200;
const WATCHDOG_MS = 2000;
const QUIET_MS = 750;
const ACQUIRE_TIMEOUT_MS = 15000;
const TRANSCRIPT_TIMEOUT_MS = 5000;
const INTER_CASE_MS = 400;
/** getUserMedia rejections that mean the environment, not the product, stopped the run. */
const BLOCKING_GUM_ERRORS = new Set(['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError']);

// --- RESULT TYPES ---

type Detail = string | number | boolean | null;
type Details = Readonly<Record<string, Detail>>;

export interface TimelineEvent {
  seq: number;
  relMs: number;
  event: string;
  details?: Details;
}

export interface AssertionResult {
  id: string;
  pass: boolean;
  expected: string;
  actual: string;
}

export interface CaseRunResult {
  name: string;
  title: string;
  status: 'PASS' | 'FAIL' | 'BLOCKED';
  failure: string | null;
  blocker: { reason: string; action: string } | null;
  metrics: Record<string, number | boolean | null>;
  assertions: AssertionResult[];
  eventTimeline: TimelineEvent[];
}

export interface QualificationSuiteResult {
  evidenceKind: 'browser-execution';
  overall: 'PASS' | 'FAIL' | 'BLOCKED';
  fullSuite: boolean;
  executedAt: string;
  requestedCases: string[];
  casesNotRun: string[];
  suiteError: string | null;
  suiteSafety: {
    deviceActivityOutsideCase: number;
    lateGrantTracksStopped: number;
    networkAttemptsOutsideCase: number;
    finalForcedStops: number;
    eventsAfterCaseClose: number;
  };
  provenance: typeof PROVENANCE;
  environment: ReturnType<typeof inspectEnvironment>;
  cases: CaseRunResult[];
}

// --- PER-CASE RECORD ---

const COUNT_KEYS = [
  'gumCalls', 'gumSuccesses', 'gumErrors', 'gumCallsAfterUnmount',
  'recordersCreated', 'recordersCreatedAfterUnmount', 'recorderStarts', 'recorderStartsAfterUnmount',
  'recorderStopCalls', 'dataavailable', 'onstop', 'recorderErrors', 'untrackedTrackStops',
  'watchdogStops', 'releaseActions', 'transcribeCalls',
  'highFrequencyActions', 'highFrequencyAfterUnmount',
  'errorActions', 'errorStates', 'consoleErrors', 'consoleWarns', 'windowErrors', 'unhandledRejections',
  'networkAttempts'
] as const;
type CountKey = (typeof COUNT_KEYS)[number];

class CaseRecord {
  readonly startedAt = performance.now();
  readonly events: TimelineEvent[] = [];
  readonly counts = Object.fromEntries(COUNT_KEYS.map((key) => [key, 0])) as Record<CountKey, number>;
  readonly tracks: MediaStreamTrack[] = [];
  readonly dataSizes: number[] = [];
  readonly transcribeSizes: number[] = [];
  readonly transcripts: string[] = [];
  closed = false;
  unmountBegun = false;
  inErrorState = false;
  fakeLabel = false;
  gumErrorName: string | null = null;
  firstGumSuccessAt: number | null = null;
  allTracksEndedAt: number | null = null;

  constructor(readonly name: string) {}

  record(event: string, details?: Details): number {
    const seq = this.events.length + 1;
    const relMs = Math.round((performance.now() - this.startedAt) * 10) / 10;
    this.events.push(details ? { seq, relMs, event, details } : { seq, relMs, event });
    return seq;
  }
}

/** The case whose lifetime is open; device work started outside one is stray. */
let openCase: CaseRecord | null = null;
const trackOwner = new WeakMap<MediaStreamTrack, CaseRecord | null>();
const recorderOwner = new WeakMap<MediaRecorder, CaseRecord>();
const allAcquiredTracks = new Set<MediaStreamTrack>();
const stray = { deviceActivity: 0, lateGrantTracksStopped: 0, networkAttempts: 0, eventsAfterClose: 0 };

function isOpen(rec: CaseRecord | null | undefined): rec is CaseRecord {
  return rec != null && !rec.closed;
}

function note(rec: CaseRecord | null | undefined, event: string, details?: Details): void {
  if (isOpen(rec)) rec.record(event, details);
  else stray.eventsAfterClose++;
}

function bump(rec: CaseRecord | null | undefined, key: CountKey): void {
  if (isOpen(rec)) rec.counts[key]++;
}

// --- NATIVE REFERENCES (captured before any patching) ---

const NATIVE = {
  getUserMedia: typeof MediaDevices !== 'undefined' ? MediaDevices.prototype.getUserMedia : undefined,
  gumShadowedBeforeHarness:
    typeof navigator !== 'undefined' && navigator.mediaDevices !== undefined && Object.hasOwn(navigator.mediaDevices, 'getUserMedia'),
  MediaRecorder: typeof MediaRecorder !== 'undefined' ? MediaRecorder : undefined,
  recorderStart: typeof MediaRecorder !== 'undefined' ? MediaRecorder.prototype.start : undefined,
  recorderStop: typeof MediaRecorder !== 'undefined' ? MediaRecorder.prototype.stop : undefined,
  trackStop: typeof MediaStreamTrack !== 'undefined' ? MediaStreamTrack.prototype.stop : undefined
};

function isNativeFunction(fn: unknown): boolean {
  return typeof fn === 'function' && /\{\s*\[native code\]\s*\}\s*$/.test(Function.prototype.toString.call(fn));
}

/** Stops live tracks through the unwrapped native method; returns how many were live. */
function forceStop(tracks: Iterable<MediaStreamTrack>): number {
  let stopped = 0;
  for (const track of tracks) {
    if (track.readyState !== 'ended') {
      NATIVE.trackStop?.call(track);
      stopped++;
    }
  }
  return stopped;
}

// --- PASSIVE INSTRUMENTATION ---

function onAcquired(owner: CaseRecord | null, stream: MediaStream): void {
  const tracks = stream.getTracks();
  for (const track of tracks) {
    allAcquiredTracks.add(track);
    trackOwner.set(track, owner);
  }
  if (!isOpen(owner)) {
    // A grant that resolved after its case closed (or outside any case) never stays open.
    stray.lateGrantTracksStopped += forceStop(tracks);
    return;
  }
  const rec = owner;
  rec.counts.gumSuccesses++;
  rec.tracks.push(...tracks);
  if (tracks.some((track) => /fake/i.test(track.label))) rec.fakeLabel = true;
  rec.record('gum.success', { tracks: tracks.length, audioTracks: stream.getAudioTracks().length });

  if (rec.firstGumSuccessAt === null) {
    rec.firstGumSuccessAt = performance.now();
    // Absolute deadline for everything this case acquires. Never cleared.
    window.setTimeout(() => {
      const stopped = forceStop(rec.tracks);
      if (stopped > 0) {
        rec.counts.watchdogStops += stopped;
        note(rec, 'watchdog.force_stop', { tracks: stopped });
      }
    }, WATCHDOG_MS);
  } else if (performance.now() - rec.firstGumSuccessAt >= WATCHDOG_MS) {
    const stopped = forceStop(tracks);
    rec.counts.watchdogStops += stopped;
    rec.record('watchdog.force_stop', { tracks: stopped });
  }
}

function installInstrumentation(): void {
  const nativeGum = NATIVE.getUserMedia;
  if (nativeGum && navigator.mediaDevices) {
    const devices = navigator.mediaDevices;
    devices.getUserMedia = function (constraints?: MediaStreamConstraints): Promise<MediaStream> {
      const owner = openCase;
      if (isOpen(owner)) {
        owner.counts.gumCalls++;
        if (owner.unmountBegun) owner.counts.gumCallsAfterUnmount++;
        owner.record(owner.unmountBegun ? 'gum.call_after_unmount' : 'gum.call');
      } else {
        stray.deviceActivity++;
      }
      return nativeGum.call(devices, constraints).then(
        (stream) => {
          onAcquired(owner, stream);
          return stream;
        },
        (error: unknown) => {
          const name = error instanceof Error ? error.name : 'UnknownError';
          if (isOpen(owner)) {
            owner.counts.gumErrors++;
            owner.gumErrorName ??= name;
            owner.record('gum.error', { name });
          }
          throw error;
        }
      );
    };
  }

  const nativeTrackStop = NATIVE.trackStop;
  if (nativeTrackStop) {
    MediaStreamTrack.prototype.stop = function (this: MediaStreamTrack): void {
      nativeTrackStop.call(this);
      const owner = trackOwner.has(this) ? trackOwner.get(this) : openCase;
      if (!isOpen(owner)) {
        stray.eventsAfterClose++;
        return;
      }
      const trackIndex = owner.tracks.indexOf(this);
      if (trackIndex < 0) owner.counts.untrackedTrackStops++;
      owner.record('track.stop', { kind: this.kind, readyStateAfter: this.readyState, trackIndex });
      if (owner.allTracksEndedAt === null && owner.tracks.length > 0 && owner.tracks.every((t) => t.readyState === 'ended')) {
        owner.allTracksEndedAt = performance.now();
      }
    };
  }

  const NativeRecorder = NATIVE.MediaRecorder;
  const nativeStart = NATIVE.recorderStart;
  const nativeStop = NATIVE.recorderStop;
  if (NativeRecorder && nativeStart && nativeStop) {
    MediaRecorder.prototype.start = function (this: MediaRecorder, ...args: [timeslice?: number]): void {
      nativeStart.apply(this, args);
      const owner = recorderOwner.get(this);
      if (!isOpen(owner)) {
        stray.deviceActivity++;
        return;
      }
      owner.counts.recorderStarts++;
      if (owner.unmountBegun) owner.counts.recorderStartsAfterUnmount++;
      owner.record(owner.unmountBegun ? 'recorder.start_after_unmount' : 'recorder.start', { stateAfter: this.state });
    };

    MediaRecorder.prototype.stop = function (this: MediaRecorder): void {
      nativeStop.call(this);
      const owner = recorderOwner.get(this);
      if (!isOpen(owner)) {
        stray.eventsAfterClose++;
        return;
      }
      owner.counts.recorderStopCalls++;
      owner.record('recorder.stop', {
        stateAfter: this.state,
        dataavailableSoFar: owner.counts.dataavailable,
        onstopSoFar: owner.counts.onstop
      });
    };

    class InstrumentedMediaRecorder extends NativeRecorder {
      constructor(stream: MediaStream, options?: MediaRecorderOptions) {
        super(stream, options);
        const owner = openCase;
        if (!isOpen(owner)) {
          stray.deviceActivity++;
          return;
        }
        recorderOwner.set(this, owner);
        owner.counts.recordersCreated++;
        if (owner.unmountBegun) owner.counts.recordersCreatedAfterUnmount++;
        owner.record(owner.unmountBegun ? 'recorder.created_after_unmount' : 'recorder.created', { mimeType: this.mimeType });
        // Registered before the library assigns ondataavailable/onstop, so these observe first.
        this.addEventListener('dataavailable', (event: BlobEvent) => {
          const size = event.data.size;
          bump(owner, 'dataavailable');
          if (isOpen(owner)) owner.dataSizes.push(size);
          note(owner, 'recorder.dataavailable', { size });
        });
        this.addEventListener('stop', () => {
          bump(owner, 'onstop');
          note(owner, 'recorder.onstop');
        });
        this.addEventListener('error', () => {
          bump(owner, 'recorderErrors');
          note(owner, 'recorder.error');
        });
      }
    }
    window.MediaRecorder = InstrumentedMediaRecorder as typeof MediaRecorder;
  }

  // Error signals: counts only, never arguments.
  const nativeConsoleError = console.error;
  const nativeConsoleWarn = console.warn;
  console.error = function (...args: unknown[]): void {
    bump(openCase, 'consoleErrors');
    note(openCase, 'console.error');
    nativeConsoleError.apply(console, args);
  };
  console.warn = function (...args: unknown[]): void {
    bump(openCase, 'consoleWarns');
    note(openCase, 'console.warn');
    nativeConsoleWarn.apply(console, args);
  };
  window.addEventListener('error', () => {
    bump(openCase, 'windowErrors');
    note(openCase, 'window.error');
  });
  window.addEventListener('unhandledrejection', () => {
    bump(openCase, 'unhandledRejections');
    note(openCase, 'window.unhandledrejection');
  });

  // Network is blocked and counted for the whole page lifetime.
  const blocked = (kind: string): void => {
    if (isOpen(openCase)) {
      openCase.counts.networkAttempts++;
      openCase.record('network.blocked', { kind });
    } else {
      stray.networkAttempts++;
    }
  };
  window.fetch = function (): Promise<Response> {
    blocked('fetch');
    return Promise.reject(new Error('Network activity is prohibited in the M12 harness'));
  };
  XMLHttpRequest.prototype.send = function (): void {
    blocked('xhr');
    throw new Error('Network activity is prohibited in the M12 harness');
  };
  navigator.sendBeacon = function (): boolean {
    blocked('sendBeacon');
    return false;
  };
  WebSocket.prototype.send = function (): void {
    blocked('websocket');
    throw new Error('Network activity is prohibited in the M12 harness');
  };

  // Leaving the page never leaves a microphone open.
  window.addEventListener('pagehide', () => forceStop(allAcquiredTracks));
}

installInstrumentation();

function inspectEnvironment() {
  const nativeGetUserMedia = isNativeFunction(NATIVE.getUserMedia) && !NATIVE.gumShadowedBeforeHarness;
  const nativeMediaRecorder =
    isNativeFunction(NATIVE.MediaRecorder) && isNativeFunction(NATIVE.recorderStart) && isNativeFunction(NATIVE.recorderStop);
  const nativeTrackStop = isNativeFunction(NATIVE.trackStop);
  const webdriver = navigator.webdriver === true;
  const installedMatchesProvenance =
    INSTALLED.core === PROVENANCE.packages[0].version && INSTALLED.media === PROVENANCE.packages[1].version;
  return {
    userAgent: navigator.userAgent,
    isSecureContext: window.isSecureContext,
    nativeGetUserMedia,
    nativeMediaRecorder,
    nativeTrackStop,
    webdriver,
    installedCore: INSTALLED.core,
    installedMedia: INSTALLED.media,
    installedMatchesProvenance
  };
}

// --- SUBJECTS: the store the view is mounted on, and how to read it ---

type ViewStoreProp = ComponentProps<typeof VoiceInput>['store'];
type Mode = 'push-to-talk' | 'conversation';

interface Subject {
  view: ViewStoreProp;
  voice(): VoiceInputState | null | undefined;
  drafts(): readonly string[] | null;
  destroy(): void;
}

const HIGH_FREQUENCY_ACTIONS = new Set(['audioLevelUpdated', 'speechDetected', 'silenceDetected']);
const ERROR_ACTIONS = new Set(['_operationFailed', 'audioProcessingFailed', 'microphonePermissionDenied']);

function observeVoiceAction(rec: CaseRecord, action: VoiceInputAction): void {
  if (!isOpen(rec)) {
    stray.eventsAfterClose++;
    return;
  }
  const type: string = action.type;
  if (HIGH_FREQUENCY_ACTIONS.has(type)) {
    rec.counts.highFrequencyActions++;
    if (rec.unmountBegun) rec.counts.highFrequencyAfterUnmount++;
    return;
  }
  rec.record(`action.${type}`);
  if (action.type === 'transcriptionCompleted') rec.transcripts.push(action.transcript);
  if (type === '_releaseDevice') rec.counts.releaseActions++;
  if (ERROR_ACTIONS.has(type)) rec.counts.errorActions++;
}

function observeVoiceState(rec: CaseRecord, state: VoiceInputState | null | undefined): void {
  if (!isOpen(rec) || !state) return;
  const erroneous = state.status === 'error' || state.errorMessage !== null;
  if (erroneous && !rec.inErrorState) {
    rec.counts.errorStates++;
    rec.record('state.error', { status: state.status });
  }
  rec.inErrorState = erroneous;
}

function stubDependencies(rec: CaseRecord): VoiceInputDependencies {
  return {
    createAudioManager: createVoiceInputAudioManager,
    getAudioManager: getVoiceInputAudioManager,
    deleteAudioManager: deleteVoiceInputAudioManager,
    // Local stub: reads only the byte size. The Blob is neither retained nor sent.
    transcribeAudio: async (blob: Blob) => {
      const size = blob.size;
      bump(rec, 'transcribeCalls');
      if (isOpen(rec)) rec.transcribeSizes.push(size);
      note(rec, 'stub.transcribeAudio', { size });
      return expectedTranscript(size);
    }
  };
}

function expectedTranscript(size: number): string {
  return `stub-transcript-${size}-bytes`;
}

function standaloneSubject(rec: CaseRecord): Subject {
  const store = createStore({
    initialState: createInitialVoiceInputState(),
    reducer: voiceInputReducer,
    dependencies: stubDependencies(rec),
    maxHistorySize: 0
  });
  if (!store.subscribeToActions) throw new Error('Store does not expose subscribeToActions');
  store.subscribeToActions((action) => observeVoiceAction(rec, action));
  store.subscribe((state) => observeVoiceState(rec, state));
  return { view: store, voice: () => store.state, drafts: () => null, destroy: () => store.destroy() };
}

interface ManagedRootState {
  voice: VoiceInputState | null;
  drafts: string[];
}

type ManagedRootAction =
  | { type: 'voice'; action: PresentationAction<VoiceInputAction> }
  | { type: 'dictate' }
  | { type: 'stopDictating' };

const managedComposerReducer: Reducer<ManagedRootState, ManagedRootAction, VoiceInputDependencies> = (state, action) => {
  switch (action.type) {
    case 'dictate':
      return [{ ...state, voice: state.voice ?? createInitialVoiceInputState() }, Effect.none()];
    case 'stopDictating':
      return [{ ...state, voice: null }, Effect.none()];
    case 'voice': {
      const child = action.action;
      if (child.type === 'presented' && child.action.type === 'transcriptionCompleted') {
        return [{ ...state, drafts: [...state.drafts, child.action.transcript] }, Effect.none()];
      }
      return [state, Effect.none()];
    }
  }
};

const managedVoiceSlot = optionalSlot<ManagedRootState, ManagedRootAction>()('voice');
const managedComposition = new ManagedIntegrationBuilder(managedComposerReducer)
  .with(managedVoiceSlot, voiceInputReducer)
  .build();

function managedSubject(rec: CaseRecord): Subject {
  const parent = createStore({
    initialState: { voice: createInitialVoiceInputState(), drafts: [] } satisfies ManagedRootState,
    dependencies: stubDependencies(rec),
    maxHistorySize: 0,
    ...managedComposition
  });
  const child = managedComposition.bind(parent, managedVoiceSlot);
  if (!child || !parent.subscribeToActions) {
    parent.destroy();
    throw new Error('Managed voice slot did not bind');
  }
  parent.subscribeToActions((action) => {
    if (action.type === 'voice' && action.action.type === 'presented') observeVoiceAction(rec, action.action.action);
    else note(rec, `parent.${action.type}${action.type === 'voice' ? `.${action.action.type}` : ''}`);
  });
  parent.subscribe((state) => observeVoiceState(rec, state.voice));
  return { view: child, voice: () => parent.state.voice, drafts: () => parent.state.drafts, destroy: () => parent.destroy() };
}

// --- CASES ---

interface CaseSpec {
  name: string;
  title: string;
  mode: Mode;
  managed: boolean;
}

const CASES: readonly CaseSpec[] = [
  { name: 'standalone-push-to-talk', title: 'Standalone store, push-to-talk', mode: 'push-to-talk', managed: false },
  { name: 'standalone-conversation', title: 'Standalone store, conversation', mode: 'conversation', managed: false },
  { name: 'managed-parent-conversation', title: 'Living managed parent, conversation', mode: 'conversation', managed: true }
];

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Polls a condition; rejects on a reported problem or at the deadline. Timers only, no store hooks. */
function waitFor(label: string, condition: () => boolean, problem: () => string | null, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = performance.now() + timeoutMs;
    const check = (): void => {
      let issue: string | null = null;
      let done = false;
      try {
        issue = problem();
        done = issue === null && condition();
      } catch (error) {
        issue = describe(error);
      }
      if (issue !== null) {
        window.clearInterval(timer);
        reject(new Error(issue));
      } else if (done) {
        window.clearInterval(timer);
        resolve();
      } else if (performance.now() >= deadline) {
        window.clearInterval(timer);
        reject(new Error(`Timed out after ${timeoutMs} ms waiting for ${label}`));
      }
    };
    const timer = window.setInterval(check, 20);
    check();
  });
}

interface Mounted {
  component: ReturnType<typeof mount> | null;
}

async function exercise(spec: CaseSpec, rec: CaseRecord, subject: Subject, mounted: Mounted): Promise<void> {
  const problem = (): string | null => {
    if (rec.gumErrorName) return `getUserMedia rejected (${rec.gumErrorName})`;
    if (rec.counts.watchdogStops > 0) return 'Watchdog force-stopped live tracks';
    return subject.voice()?.status === 'error' ? 'VoiceInput entered its error state' : null;
  };

  if (spec.mode === 'push-to-talk') {
    subject.view.dispatch({ type: 'activatePushToTalk' });
    subject.view.dispatch({ type: 'startPushToTalkRecording' });
  } else {
    subject.view.dispatch({ type: 'activateConversationMode' });
  }
  await waitFor(
    'recording to start',
    () => {
      const voice = subject.voice();
      return voice?.status === 'recording' && voice.mode === spec.mode && voice.recordingStartTime !== null;
    },
    problem,
    ACQUIRE_TIMEOUT_MS
  );

  rec.record('capture.begin');
  const captureEnd = performance.now() + CAPTURE_MS;
  await waitFor('bounded capture', () => performance.now() >= captureEnd, problem, CAPTURE_MS + 500);

  const before = subject.voice();
  const stopAction = spec.mode === 'push-to-talk' ? 'stopPushToTalkRecording' : 'manualSendRequested';
  rec.record('accepted_stop.dispatch_begin', {
    action: stopAction,
    statusBefore: before?.status ?? null,
    modeBefore: before?.mode ?? null
  });
  subject.view.dispatch({ type: stopAction });
  const after = subject.voice();
  rec.record('accepted_stop.dispatch_end', {
    statusAfter: after?.status ?? null,
    activeStopIsNumber: typeof after?._activeStop === 'number'
  });

  // Unmount synchronously after the accepted stop: the native stop is still pending.
  const component = mounted.component;
  mounted.component = null;
  rec.unmountBegun = true;
  rec.record('unmount.begin');
  const unmounted = component ? unmount(component) : Promise.resolve();
  rec.record('unmount.returned');
  await unmounted;

  await waitFor('transcriptionCompleted', () => rec.transcripts.length > 0, problem, TRANSCRIPT_TIMEOUT_MS);

  rec.record('quiet.begin');
  await sleep(QUIET_MS);
  rec.record('quiet.end');
}

// --- EVALUATION ---

function evaluate(spec: CaseSpec, rec: CaseRecord, subject: Subject | null, failure: string | null) {
  const c = rec.counts;
  const events = rec.events;
  const env = inspectEnvironment();
  const firstOf = (name: string) => events.find((e) => e.event === name);
  const allOf = (name: string) => events.filter((e) => e.event === name);
  const seq = (e: TimelineEvent | undefined) => e?.seq ?? Number.NaN;
  const lt = (...values: number[]) => values.every((value, i) => !Number.isNaN(value) && (i === 0 || values[i - 1]! < value));

  const stopBegin = firstOf('accepted_stop.dispatch_begin');
  const recStop = firstOf('recorder.stop');
  const stopEnd = firstOf('accepted_stop.dispatch_end');
  const unmountBegin = firstOf('unmount.begin');
  const unmountReturned = firstOf('unmount.returned');
  const release = firstOf('action._releaseDevice');
  const trackStops = allOf('track.stop');
  const dataEvents = allOf('recorder.dataavailable');
  const stopEvents = allOf('recorder.onstop');
  const transcribe = firstOf('stub.transcribeAudio');
  const completed = allOf('action.transcriptionCompleted');
  const quietBegin = firstOf('quiet.begin');
  const quietEnd = firstOf('quiet.end');

  const firstTrackStopSeq = trackStops.length ? Math.min(...trackStops.map((e) => e.seq)) : Number.NaN;
  const lastTrackStopSeq = trackStops.length ? Math.max(...trackStops.map((e) => e.seq)) : Number.NaN;
  const stoppedIndices = new Set(trackStops.map((e) => e.details?.['trackIndex']));
  const blobSize = rec.dataSizes.length === 1 ? rec.dataSizes[0]! : null;
  const micOpenMs =
    rec.firstGumSuccessAt !== null && rec.allTracksEndedAt !== null ? Math.round(rec.allTracksEndedAt - rec.firstGumSuccessAt) : null;
  const tracksEnded = rec.tracks.filter((t) => t.readyState === 'ended').length;
  const lateEvents = quietBegin && quietEnd ? quietEnd.seq - quietBegin.seq - 1 : null;
  const voice = subject?.voice() ?? null;
  const drafts = subject?.drafts() ?? null;
  const transcript = blobSize !== null ? expectedTranscript(blobSize) : null;

  const assertions: AssertionResult[] = [];
  const check = (id: string, pass: boolean, expected: string, actual: string) => assertions.push({ id, pass, expected, actual });

  check('harness-completed', failure === null, 'no failure, timeout or error state', failure ?? 'completed');

  check(
    'genuine-environment',
    env.nativeGetUserMedia && env.nativeMediaRecorder && env.nativeTrackStop && !env.webdriver && !rec.fakeLabel && env.installedMatchesProvenance,
    'native gUM/MediaRecorder/track.stop, webdriver false, no fake-labelled track, installed core 0.13.1 / media 0.5.0',
    `nativeGUM=${env.nativeGetUserMedia} nativeMR=${env.nativeMediaRecorder} nativeTrackStop=${env.nativeTrackStop} webdriver=${env.webdriver} fakeLabel=${rec.fakeLabel} core=${env.installedCore} media=${env.installedMedia}`
  );

  check(
    'single-native-acquisition',
    c.gumCalls === 1 && c.gumSuccesses === 1 && c.gumErrors === 0 && rec.tracks.length > 0 &&
      rec.tracks.every((t) => t.kind === 'audio') && c.untrackedTrackStops === 0,
    '1 gUM call, 1 success, 0 errors, >=1 audio track, 0 untracked track stops',
    `calls=${c.gumCalls} successes=${c.gumSuccesses} errors=${c.gumErrors} tracks=${rec.tracks.length} untrackedStops=${c.untrackedTrackStops}`
  );

  check(
    'accepted-stop-pending-at-unmount',
    lt(seq(stopBegin), seq(recStop), seq(stopEnd), seq(unmountBegin)) &&
      stopBegin?.details?.['statusBefore'] === 'recording' &&
      stopBegin?.details?.['modeBefore'] === spec.mode &&
      recStop?.details?.['stateAfter'] === 'inactive' &&
      recStop?.details?.['dataavailableSoFar'] === 0 &&
      recStop?.details?.['onstopSoFar'] === 0 &&
      stopEnd?.details?.['statusAfter'] === 'processing' &&
      stopEnd?.details?.['activeStopIsNumber'] === true &&
      c.recorderStopCalls === 1 &&
      !(firstTrackStopSeq < seq(unmountBegin)),
    'dispatch_begin(recording) < recorder.stop(inactive, 0 dataavailable, 0 onstop) < dispatch_end(processing, _activeStop) < unmount.begin; 1 stop call; no track.stop before unmount',
    `seqs ${seq(stopBegin)} < ${seq(recStop)} < ${seq(stopEnd)} < ${seq(unmountBegin)}; recorder=${String(recStop?.details?.['stateAfter'])} status=${String(stopEnd?.details?.['statusAfter'])} stopCalls=${c.recorderStopCalls} firstTrackStop=${firstTrackStopSeq}`
  );

  check(
    'unmount-release-ends-every-track',
    c.releaseActions === 1 &&
      lt(seq(unmountBegin), seq(release), firstTrackStopSeq) &&
      lastTrackStopSeq < seq(unmountReturned) &&
      trackStops.every((e) => e.details?.['readyStateAfter'] === 'ended') &&
      stoppedIndices.size === rec.tracks.length && !stoppedIndices.has(-1) && rec.allTracksEndedAt !== null,
    'unmount.begin < _releaseDevice < every track.stop (ended) < unmount.returned; every acquired track stopped',
    `release=${c.releaseActions}@${seq(release)} trackStops=${trackStops.length}@[${firstTrackStopSeq}..${lastTrackStopSeq}] unmount=[${seq(unmountBegin)}..${seq(unmountReturned)}] distinct=${stoppedIndices.size}/${rec.tracks.length}`
  );

  check(
    'tracks-ended-before-native-delivery',
    trackStops.length > 0 && dataEvents.length > 0 && lastTrackStopSeq < dataEvents[0]!.seq,
    'max(seq track.stop) < seq first dataavailable',
    `lastTrackStop=${lastTrackStopSeq} firstDataavailable=${seq(dataEvents[0])}`
  );

  check(
    'native-delivery-exactly-once',
    c.dataavailable === 1 && c.onstop === 1 && blobSize !== null && blobSize > 0 &&
      lt(seq(dataEvents[0]), seq(stopEvents[0])) && c.recorderErrors === 0,
    '1 dataavailable (size > 0) < 1 onstop, 0 recorder errors',
    `dataavailable=${c.dataavailable} size=${blobSize} onstop=${c.onstop} recorderErrors=${c.recorderErrors}`
  );

  check(
    'single-local-transcript-delivered',
    c.transcribeCalls === 1 && rec.transcribeSizes[0] === blobSize && completed.length === 1 &&
      lt(seq(stopEvents[0]), seq(transcribe), seq(completed[0])) &&
      rec.transcripts.length === 1 && rec.transcripts[0] === transcript &&
      (!spec.managed || (drafts !== null && drafts.length === 1 && drafts[0] === transcript)),
    `1 stub transcribe of the delivered size; onstop < transcribe < 1 transcriptionCompleted${spec.managed ? '; parent drafts == [transcript]' : ''}`,
    `transcribe=${c.transcribeCalls} sizes=[${rec.transcribeSizes.join(',')}] completed=${completed.length} seqs ${seq(stopEvents[0])} < ${seq(transcribe)} < ${seq(completed[0])}${spec.managed ? ` drafts=${drafts?.length ?? 'none'}` : ''}`
  );

  check(
    'no-restart-or-reacquire',
    c.recordersCreated === 1 && c.recorderStarts === 1 &&
      c.gumCallsAfterUnmount === 0 && c.recordersCreatedAfterUnmount === 0 && c.recorderStartsAfterUnmount === 0,
    '1 recorder created and started; 0 gUM / recorders / starts after unmount',
    `created=${c.recordersCreated} started=${c.recorderStarts} afterUnmount: gum=${c.gumCallsAfterUnmount} created=${c.recordersCreatedAfterUnmount} started=${c.recorderStartsAfterUnmount}`
  );

  check(
    'mic-open-window-bounded',
    micOpenMs !== null && micOpenMs > 0 && micOpenMs <= WATCHDOG_MS && c.watchdogStops === 0,
    `0 < gUM success -> last track ended <= ${WATCHDOG_MS} ms, 0 watchdog stops`,
    `micOpenMs=${micOpenMs} watchdogStops=${c.watchdogStops}`
  );

  check(
    'no-errors-or-network',
    c.errorActions === 0 && c.errorStates === 0 && c.consoleErrors === 0 && c.windowErrors === 0 &&
      c.unhandledRejections === 0 && c.networkAttempts === 0,
    'all 0',
    `errorActions=${c.errorActions} errorStates=${c.errorStates} consoleErrors=${c.consoleErrors} windowErrors=${c.windowErrors} unhandledRejections=${c.unhandledRejections} network=${c.networkAttempts}`
  );

  check(
    'settled-after-quiet-period',
    lateEvents === 0 && c.highFrequencyAfterUnmount === 0 && voice !== null &&
      voice.status === 'idle' && voice.mode === null && voice._activeStop == null &&
      (voice._pendingTranscriptions ?? []).length === 0 && voice._audioManagerId === null && voice.errorMessage === null,
    `0 events during ${QUIET_MS} ms quiet period; living ${spec.managed ? 'parent voice slot' : 'store'} idle, mode null, no active stop/pending/manager/error`,
    `lateEvents=${lateEvents} levelOrVadAfterUnmount=${c.highFrequencyAfterUnmount} voice=${voice === null ? 'none' : `status=${voice.status} mode=${voice.mode} activeStop=${voice._activeStop ?? null} pending=${(voice._pendingTranscriptions ?? []).length} manager=${voice._audioManagerId === null ? 'null' : 'set'} error=${voice.errorMessage !== null}`}`
  );

  const metrics: Record<string, number | boolean | null> = {
    ...c,
    tracksAcquired: rec.tracks.length,
    tracksEndedAtEvaluation: tracksEnded,
    tracksLiveAtEvaluation: rec.tracks.length - tracksEnded,
    micOpenMs,
    blobSizeBytes: blobSize,
    fakeLabelDetected: rec.fakeLabel
  };
  return { assertions, metrics };
}

async function runCase(spec: CaseSpec): Promise<CaseRunResult> {
  const rec = new CaseRecord(spec.name);
  openCase = rec;
  const target = document.getElementById('voice');
  const mounted: Mounted = { component: null };
  let subject: Subject | null = null;
  let failure: string | null = null;

  try {
    if (!target) throw new Error('Missing #voice mount target');
    subject = spec.managed ? managedSubject(rec) : standaloneSubject(rec);
    mounted.component = mount(VoiceInput, { target, props: { store: subject.view, defaultMode: spec.mode } });
    await exercise(spec, rec, subject, mounted);
  } catch (error) {
    failure = describe(error);
    rec.record('harness.failure');
  }

  // Evaluate before any forced cleanup so leaks stay visible.
  let evaluation: ReturnType<typeof evaluate> | null = null;
  try {
    evaluation = evaluate(spec, rec, subject, failure);
  } catch (error) {
    failure = `${failure ?? 'completed'}; evaluation failed: ${describe(error)}`;
  }

  // Forced cleanup on every path.
  if (mounted.component) {
    try {
      await unmount(mounted.component);
    } catch {
      /* forced stop below still runs */
    }
    mounted.component = null;
  }
  try {
    subject?.destroy();
  } catch {
    /* forced stop below still runs */
  }
  const forcedCleanupStops = forceStop(rec.tracks);
  rec.closed = true;
  openCase = null;
  target?.replaceChildren();

  const assertions = evaluation?.assertions ?? [
    { id: 'evaluation-completed', pass: false, expected: 'evaluation ran', actual: failure ?? 'unknown' }
  ];
  assertions.push({
    id: 'no-forced-cleanup',
    pass: forcedCleanupStops === 0,
    expected: '0 live tracks left for the harness to stop',
    actual: `forcedCleanupStops=${forcedCleanupStops}`
  });

  const blocked = rec.gumErrorName !== null && BLOCKING_GUM_ERRORS.has(rec.gumErrorName) && rec.counts.gumSuccesses === 0;
  return {
    name: spec.name,
    title: spec.title,
    status: blocked ? 'BLOCKED' : assertions.every((a) => a.pass) ? 'PASS' : 'FAIL',
    failure,
    blocker: blocked
      ? {
          reason: `getUserMedia rejected with ${rec.gumErrorName} before any track was acquired`,
          action:
            'Allow microphone access for Google Chrome in macOS System Settings > Privacy & Security > Microphone, ' +
            'allow the microphone for this origin in Chrome site settings, confirm an input device exists, then click Run again.'
        }
      : null,
    metrics: { ...(evaluation?.metrics ?? {}), forcedCleanupStops },
    assertions,
    eventTimeline: rec.events.slice()
  };
}

// --- UI ---

const controlIds = ['run-qualification', 'run-ptt', 'run-conversation', 'run-managed'] as const;

function setControlsDisabled(disabled: boolean): void {
  for (const id of controlIds) {
    const button = document.getElementById(id);
    if (button instanceof HTMLButtonElement) button.disabled = disabled;
  }
}

function log(message: string): void {
  const el = document.getElementById('log');
  if (el) el.textContent += `[${new Date().toISOString().substring(11, 23)}] ${message}\n`;
}

function setStatus(status: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL' | 'BLOCKED', message: string): void {
  const badge = document.getElementById('status-badge');
  const text = document.getElementById('status-message');
  if (badge) {
    badge.className = `badge badge-${status.toLowerCase()}`;
    badge.textContent = status;
  }
  if (text) text.textContent = message;
}

function writeJson(value: unknown): void {
  const el = document.getElementById('results-json');
  if (el) el.textContent = JSON.stringify(value, null, 2);
}

function element(tag: string, text?: string, className?: string): HTMLElement {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function renderBlocker(result: CaseRunResult | undefined): void {
  const banner = document.getElementById('blocker-banner');
  if (!banner) return;
  banner.replaceChildren();
  banner.style.display = result?.blocker ? 'block' : 'none';
  if (!result?.blocker) return;
  banner.append(
    element('strong', `BLOCKED (${result.name}): ${result.blocker.reason}`),
    element('p', result.blocker.action),
    element('p', `Runner URL: ${window.location.origin}${window.location.pathname}`)
  );
}

function renderSummary(suite: QualificationSuiteResult): void {
  const container = document.getElementById('results-summary');
  if (!container) return;
  const overview = element('div', undefined, `suite-overview suite-${suite.overall.toLowerCase()}`);
  overview.append(
    element('h3', `Overall: ${suite.overall}${suite.fullSuite ? '' : ' (subset run, not a full qualification)'}`),
    element('p', `Executed ${suite.executedAt}; installed core ${suite.environment.installedCore}, media ${suite.environment.installedMedia}`, 'suite-meta')
  );
  if (suite.suiteError) overview.append(element('p', `Suite error: ${suite.suiteError}`));
  const nodes: HTMLElement[] = [overview];
  for (const result of suite.cases) {
    const card = element('div', undefined, 'case-card');
    card.append(element('h4', `${result.title} (${result.name}): ${result.status}`));
    if (result.failure) card.append(element('p', `Failure: ${result.failure}`));
    const table = element('table', undefined, 'assertions-table');
    const head = element('tr');
    head.append(element('th', 'Assertion'), element('th', 'Result'), element('th', 'Actual'));
    table.append(head);
    for (const assertion of result.assertions) {
      const row = element('tr', undefined, assertion.pass ? 'pass' : 'fail');
      row.append(element('td', assertion.id), element('td', assertion.pass ? 'PASS' : 'FAIL'), element('td', assertion.actual));
      table.append(row);
    }
    card.append(table);
    nodes.push(card);
  }
  container.replaceChildren(...nodes);
}

// --- SUITE ---

let running = false;

async function runSuite(specs: readonly CaseSpec[]): Promise<void> {
  if (running) return;
  running = true;
  setControlsDisabled(true);
  renderBlocker(undefined);
  document.getElementById('results-summary')?.replaceChildren();
  writeJson({ status: 'running', summary: 'Bounded real-device run in progress; results are written here when it ends.' });
  setStatus('RUNNING', `Running ${specs.length} bounded case(s)...`);

  const strayBefore = { ...stray };
  const results: CaseRunResult[] = [];
  let suiteError: string | null = null;
  let finalForcedStops = 0;

  try {
    for (const [index, spec] of specs.entries()) {
      setStatus('RUNNING', `Case ${index + 1} of ${specs.length}: ${spec.title}`);
      log(`Case ${spec.name} started`);
      const result = await runCase(spec);
      results.push(result);
      log(`Case ${spec.name} finished: ${result.status}${result.failure ? ` (${result.failure})` : ''}`);
      if (result.status === 'BLOCKED') break;
      if (index < specs.length - 1) await sleep(INTER_CASE_MS);
    }
  } catch (error) {
    suiteError = describe(error);
  } finally {
    finalForcedStops = forceStop(allAcquiredTracks);
  }

  try {
    const suiteSafety = {
      deviceActivityOutsideCase: stray.deviceActivity - strayBefore.deviceActivity,
      lateGrantTracksStopped: stray.lateGrantTracksStopped - strayBefore.lateGrantTracksStopped,
      networkAttemptsOutsideCase: stray.networkAttempts - strayBefore.networkAttempts,
      finalForcedStops,
      eventsAfterCaseClose: stray.eventsAfterClose - strayBefore.eventsAfterClose
    };
    const blocked = results.some((r) => r.status === 'BLOCKED');
    const unsafe = suiteSafety.deviceActivityOutsideCase > 0 || suiteSafety.lateGrantTracksStopped > 0 || finalForcedStops > 0;
    const allRan = results.length === specs.length;
    const overall: QualificationSuiteResult['overall'] =
      suiteError !== null || unsafe
        ? 'FAIL'
        : blocked
          ? 'BLOCKED'
          : allRan && results.every((r) => r.status === 'PASS')
            ? 'PASS'
            : 'FAIL';

    const suite: QualificationSuiteResult = {
      evidenceKind: 'browser-execution',
      overall,
      fullSuite: specs.length === CASES.length,
      executedAt: new Date().toISOString(),
      requestedCases: specs.map((s) => s.name),
      casesNotRun: specs.slice(results.length).map((s) => s.name),
      suiteError,
      suiteSafety,
      provenance: PROVENANCE,
      environment: inspectEnvironment(),
      cases: results
    };
    writeJson(suite);
    renderSummary(suite);
    renderBlocker(results.find((r) => r.status === 'BLOCKED'));
    setStatus(overall, overall === 'PASS' ? 'All requested cases passed.' : overall === 'BLOCKED' ? 'Microphone unavailable; see blocker.' : 'One or more assertions failed; see results.');
    log(`Suite finished: ${overall}`);
  } catch (error) {
    setStatus('FAIL', `Result rendering failed: ${describe(error)}`);
  } finally {
    running = false;
    setControlsDisabled(false);
  }
}

function bindControls(): void {
  const bind = (id: (typeof controlIds)[number], specs: readonly CaseSpec[]) =>
    document.getElementById(id)?.addEventListener('click', () => void runSuite(specs));
  bind('run-qualification', CASES);
  bind('run-ptt', [CASES[0]!]);
  bind('run-conversation', [CASES[1]!]);
  bind('run-managed', [CASES[2]!]);
  writeJson({
    status: 'awaiting_run',
    summary: 'Harness loaded; no browser execution has happened. This block is not evidence until a Run completes.',
    provenance: PROVENANCE,
    environment: inspectEnvironment()
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControls);
else bindControls();
