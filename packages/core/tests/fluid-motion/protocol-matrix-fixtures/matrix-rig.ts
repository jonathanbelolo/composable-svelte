/**
 * Parameterized shared matrix test rig for WP4 protocol verification.
 *
 * Drives the exact production coordinator (createStagedCoordinator) and
 * real root FIFO queue across both Production Store and TestStore runtimes
 * with an instrumented physical HistoryPort and VisualCuePort.
 *
 * Contract: specs/frontend/fluid-layout-motion-design.md, Proof section.
 */
import { vi } from 'vitest';
import { createStore } from '../../../src/lib/store.svelte.js';
import { createTestStore, TestStore } from '../../../src/lib/test/index.js';
import { integrate } from '../../../src/lib/navigation/integrate.js';
import { optionalSlot } from '../../../src/lib/navigation/managed-integration.js';
import { managedRootAccess, capturedView } from '../../../src/lib/execution/store-access.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer } from '../../../src/lib/types.js';
import type { PresentationAction } from '../../../src/lib/navigation/types.js';
import { bindManagedRootRoute } from '../../../src/lib/routing/managed-binding.js';
import type { HistoryPort, HistorySnapshot, HistoryDiagnostic } from '../../../src/lib/routing/managed-history.js';
import { createStagedCoordinator } from '../../../src/lib/routing/staged/coordinator.js';
import type {
  ApplicationStaging,
  ProtocolDiagnostic,
  ProtocolEvent,
  RequestId,
  StagedRequestOptions,
  StagedRouteCoordinator,
  TransactionId,
  VisualCuePort
} from '../../../src/lib/routing/staged/types.js';

export type MatrixState = {
  url: string;
  child: { count: number } | null;
  tick: number;
};

export type MatrixAction =
  | { type: 'go'; url: string }
  | { type: 'replace' }
  | { type: 'tick' }
  | { type: 'child'; action: PresentationAction<{ type: 'inc' }> };

export type MatrixIntent = { to: string; [key: string]: unknown };

export const matrixSlot = optionalSlot<MatrixState, MatrixAction>()('child');

export interface MatrixRigOptions {
  runtime?: 'production' | 'teststore';
  initialURL?: string;
  routeKey?: (state: MatrixState) => string;
  policy?: (state: MatrixState, input: any) => boolean;
  normalize?: (url: string) => string;
  bind?: boolean;
  outlet?: boolean;
  onUnavailable?: 'immediate' | 'drop';
  cueMode?: 'auto' | 'manual';
  writePolicy?: (previous: MatrixState, next: MatrixState) => 'push' | 'replace';
  budgets?: ApplicationStaging<MatrixState, MatrixAction, MatrixIntent>['budgets'];
  initialHistorySnapshot?: Partial<HistorySnapshot>;
  before?: (store: any) => void;
}

export interface InstrumentedHistoryPort extends HistoryPort {
  readonly current: () => HistorySnapshot;
  setURL(url: string): void;
  triggerPopState(url: string, state?: unknown): void;
  failNextReplace(error?: Error): void;
  failNextPush(error?: Error): void;
  diagnostics: HistoryDiagnostic[];
  historyWrites: Array<{ kind: 'push' | 'replace'; url: string; state: unknown }>;
}

export interface MatrixRig {
  readonly runtime: 'production' | 'teststore';
  readonly store: any;
  readonly coordinator: StagedRouteCoordinator<MatrixIntent>;
  readonly port: InstrumentedHistoryPort;
  readonly trace: string[];
  readonly events: ProtocolEvent[];
  readonly diagnostics: ProtocolDiagnostic[];
  /** Errors the coordinator sent to its `report` sink (listener/visual/retirement throws); expected empty. */
  readonly reported: unknown[];
  readonly binding: { dispose(): void } | undefined;
  readonly composition: any;
  setAllowed(allowed: boolean): void;
  visit(url: string, state?: unknown): void;
  txOf(handle: { status: unknown } | RequestId): TransactionId;
  childView(): any;
  destroy(): void;
}

/**
 * Owner-bound source authority for a captured child view, built exactly as production
 * `sourceFrom` (application/routing.ts) and TestStore `_viewAuthority` build it,
 * plus a count of retirement callbacks for positive controls.
 */
export function ownerSource(view: object) {
  const capture = capturedView(view);
  let retirements = 0;
  return {
    capture,
    retirements: () => retirements,
    source: {
      owner: capture.origin,
      ownerLive: () => capture.isLive(),
      observeRetirement: (retired: () => void) => {
        let active = true;
        const record = capture.registerResource({
          kind: 'subscription',
          cleanup: () => { if (active) { retirements++; retired(); } }
        });
        return () => { active = false; record.dispose(); };
      }
    }
  };
}

export function createMatrixRig(options: MatrixRigOptions = {}): MatrixRig {
  const runtime = options.runtime ?? 'production';
  const initialURL = options.initialURL ?? '/start';
  const trace: string[] = [];
  const events: ProtocolEvent[] = [];
  const diagnostics: ProtocolDiagnostic[] = [];
  const reported: unknown[] = [];
  const cleanups: Array<() => void> = [];

  const reducer: Reducer<MatrixState, MatrixAction> = (state, action) => {
    if (action.type === 'go') {
      trace.push(`go:${action.url}`);
      if (action.url === '/throw') throw new Error('route reducer failed');
      if (action.url === '/blocked') return [state, Effect.none()];
      const nextURL = options.normalize ? options.normalize(action.url) : action.url;
      return [{ ...state, url: nextURL }, Effect.none()];
    }
    if (action.type === 'replace') return [{ ...state, child: { count: 0 } }, Effect.none()];
    if (action.type === 'tick') return [{ ...state, tick: state.tick + 1 }, Effect.none()];
    return [state, Effect.none()];
  };

  const childReducer: Reducer<{ count: number }, { type: 'inc' }> = state => [
    { count: state.count + 1 },
    Effect.none()
  ];

  const composition = integrate(reducer)
    .managed()
    // `go:/replace` replaces the child inside its own turn: a staged commit to it retires a child owner.
    .with(matrixSlot, childReducer, {
      replaceOn: action => action.type === 'replace' || (action.type === 'go' && action.url === '/replace')
    })
    .build();

  // Create store based on runtime mode
  let store: any;
  if (runtime === 'teststore') {
    store = createTestStore<MatrixState, MatrixAction>({
      initialState: { url: initialURL, child: { count: 0 }, tick: 0 },
      ...composition
    });
  } else {
    store = createStore<MatrixState, MatrixAction>({
      initialState: { url: initialURL, child: { count: 0 }, tick: 0 },
      ...composition
    });
  }
  cleanups.push(() => store.destroy());

  // Instrumented HistoryPort
  let entryId = 0;
  let currentSnapshot: HistorySnapshot = {
    url: initialURL,
    state: null,
    entryKey: `key-${entryId}`,
    ...options.initialHistorySnapshot
  };

  let popListener: (() => void) | undefined;
  let failReplaceError: Error | null = null;
  let failPushError: Error | null = null;
  const historyDiagnostics: HistoryDiagnostic[] = [];
  const historyWrites: Array<{ kind: 'push' | 'replace'; url: string; state: unknown }> = [];

  const port: InstrumentedHistoryPort = {
    current: () => currentSnapshot,
    read: () => currentSnapshot,
    replace: vi.fn((url: string, state: unknown) => {
      if (failReplaceError) {
        const err = failReplaceError;
        failReplaceError = null;
        throw err;
      }
      currentSnapshot = { ...currentSnapshot, url, state };
      historyWrites.push({ kind: 'replace', url, state });
    }),
    push: vi.fn((url: string, state: unknown) => {
      if (failPushError) {
        const err = failPushError;
        failPushError = null;
        throw err;
      }
      currentSnapshot = { url, state, entryKey: `key-${++entryId}` };
      historyWrites.push({ kind: 'push', url, state });
    }),
    go: vi.fn(),
    listen: vi.fn((fn: () => void) => {
      popListener = fn;
      return () => { popListener = undefined; };
    }),
    setURL: (url: string) => {
      currentSnapshot = { ...currentSnapshot, url };
    },
    triggerPopState: (url: string, state: unknown = null) => {
      currentSnapshot = { url, state, entryKey: `key-${++entryId}` };
      popListener?.();
    },
    failNextReplace: (error = new Error('replace failed')) => {
      failReplaceError = error;
    },
    failNextPush: (error = new Error('push failed')) => {
      failPushError = error;
    },
    diagnostics: historyDiagnostics,
    historyWrites
  };

  let allowed = true;
  const staging: ApplicationStaging<MatrixState, MatrixAction, MatrixIntent> = {
    policy: (state, input) => {
      if (options.policy) return options.policy(state, input);
      return allowed;
    },
    commit: intent => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
    routeSlot: matrixSlot,
    ...(options.routeKey ? { routeKey: options.routeKey } : {}),
    ...(options.onUnavailable ? { onUnavailable: options.onUnavailable } : {}),
    ...(options.budgets ? { budgets: options.budgets } : {})
  };

  const coordinator = createStagedCoordinator<MatrixState, MatrixAction, MatrixIntent>({
    access: managedRootAccess(store, composition.execution),
    state: () => store.state,
    subscribe: listener => store.subscribe(listener),
    staging,
    serialize: state => state.url,
    destination: url => url,
    cueMode: options.cueMode ?? 'manual',
    report: err => { reported.push(err); }
  });
  cleanups.push(() => coordinator.dispose());

  coordinator.subscribe(event => events.push(event));
  coordinator.subscribeDiagnostics(diag => diagnostics.push(diag));

  let binding: { dispose(): void } | undefined;
  options.before?.(store);

  if (options.bind !== false) {
    binding = bindManagedRootRoute({
      store,
      execution: composition.execution,
      port,
      initial: 'accepted-state',
      fragment: 'native',
      serialize: state => state.url,
      request: url => ({ action: { type: 'go', url }, expectedURL: url }),
      id: () => `id-${++entryId}`,
      report: diag => historyDiagnostics.push(diag),
      staging: eligibility => coordinator.setEligibility(eligibility),
      ...(options.writePolicy ? { writePolicy: options.writePolicy } : {})
    });
    cleanups.push(() => binding?.dispose());
  }

  if (options.outlet !== false) {
    coordinator.setOutletAttached(true);
  }

  const txOf = (handle: { status: unknown } | RequestId): TransactionId => {
    if (typeof handle === 'number') {
      const proj = coordinator.status.request(handle as RequestId);
      if (proj && typeof proj === 'object' && 'transaction' in proj) {
        return (proj as any).transaction;
      }
      throw new Error(`[MatrixRig] Request ${handle} has no transaction in status projection`);
    }
    const status = handle.status as any;
    if (status && typeof status === 'object' && 'transaction' in status) {
      return status.transaction;
    }
    throw new Error(`[MatrixRig] Handle has no transaction in status: ${JSON.stringify(status)}`);
  };

  return {
    runtime,
    store,
    coordinator,
    port,
    trace,
    events,
    diagnostics,
    reported,
    get binding() { return binding; },
    composition,
    setAllowed: (value: boolean) => { allowed = value; },
    visit: (url: string, state: unknown = null) => port.triggerPopState(url, state),
    txOf,
    childView: () => composition.bind(store, matrixSlot)!,
    destroy: () => {
      for (const cleanup of cleanups.splice(0).reverse()) {
        try { cleanup(); } catch {}
      }
    }
  };
}
