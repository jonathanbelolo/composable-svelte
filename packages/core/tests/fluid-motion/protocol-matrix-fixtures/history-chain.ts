/**
 * Physical history-chain rig: a keyed entry stack (push truncates forward, `go` is delivered later like a
 * browser, optional exact-key `traverseTo`) driving the REAL managed history connection and root binding
 * (rollback, correction, matched arrival, rebase) with the production staged coordinator. Runs on the
 * production store or on TestStore's own staging adapter (`enableStaging`), both over the same binding.
 * No history result is preset: every write/result below is produced by the actual binding/connection.
 */
import { vi } from 'vitest';
import { createStore } from '../../../src/lib/store.svelte.js';
import { createTestStore, type TestStore } from '../../../src/lib/test/index.js';
import { integrate } from '../../../src/lib/navigation/integrate.js';
import { optionalSlot } from '../../../src/lib/navigation/managed-integration.js';
import { managedRootAccess } from '../../../src/lib/execution/store-access.js';
import { Effect } from '../../../src/lib/effect.js';
import type { Reducer, Store } from '../../../src/lib/types.js';
import type { PresentationAction } from '../../../src/lib/navigation/types.js';
import { bindManagedRootRoute } from '../../../src/lib/routing/managed-binding.js';
import type { HistoryDiagnostic, HistoryPort, HistorySnapshot } from '../../../src/lib/routing/managed-history.js';
import { createStagedCoordinator } from '../../../src/lib/routing/staged/coordinator.js';
import type { ApplicationStaging, ProtocolDiagnostic, ProtocolEvent, StagedRouteCoordinator, TransactionId } from '../../../src/lib/routing/staged/types.js';

export type ChainState = { url: string; locked: boolean; tick: number; child: { count: number } | null };
export type ChainAction =
  | { type: 'go'; url: string } | { type: 'lock' } | { type: 'unlock' } | { type: 'tick' } | { type: 'replace' }
  | { type: 'child'; action: PresentationAction<{ type: 'inc' }> };
export type ChainIntent = { readonly to: string };
export const chainSlot = optionalSlot<ChainState, ChainAction>()('child');

interface Entry { url: string; state: unknown; readonly key: string }
export interface ChainPort extends HistoryPort {
  readonly entries: readonly Entry[];
  readonly index: number;
  readonly writes: Array<{ readonly kind: 'push' | 'replace'; readonly url: string }>;
  readonly gos: number[];
  /** User Back: the browser has already moved; notifies the connection. */
  back(): void;
  /** User navigation to a new entry (e.g. fragment link): push-like browser move, then notify. */
  visitNew(url: string): void;
  /** Deliver the browser's arrival for the last requested `go(delta)`. */
  deliverGo(): void;
  failReplaceWhen(predicate: ((url: string) => boolean) | undefined): void;
  /** Reject the next exact-key traversal (correction) request. */
  rejectTraverseTo(value: boolean): void;
}

export function createChainPort(initialURL: string, options: { traverseTo?: boolean } = {}): ChainPort {
  const entries: Entry[] = [{ url: initialURL, state: null, key: 'k0' }];
  let index = 0, next = 0;
  let listener: (() => void) | undefined;
  let pendingGo: number | undefined;
  let failReplace: ((url: string) => boolean) | undefined;
  let rejectTraverse = false;
  const writes: Array<{ kind: 'push' | 'replace'; url: string }> = [];
  const gos: number[] = [];
  const port: ChainPort = {
    get entries() { return entries; },
    get index() { return index; },
    writes, gos,
    read: (): HistorySnapshot => ({ url: entries[index]!.url, state: entries[index]!.state, entryKey: entries[index]!.key }),
    replace: vi.fn((url: string, state: unknown) => {
      if (failReplace?.(url)) throw new Error(`replace failed: ${url}`);
      entries[index] = { ...entries[index]!, url, state };
      writes.push({ kind: 'replace', url });
    }),
    push: vi.fn((url: string, state: unknown) => {
      entries.splice(index + 1);
      entries.push({ url, state, key: `k${++next}` });
      index = entries.length - 1;
      writes.push({ kind: 'push', url });
    }),
    go: vi.fn((delta: number) => { gos.push(delta); pendingGo = delta; }),
    listen: fn => { listener = fn; return () => { listener = undefined; }; },
    liveEntryKeys: () => entries.map(entry => entry.key),
    ...(options.traverseTo ? {
      traverseTo: async (key: string) => {
        if (rejectTraverse) throw new Error('exact-key traversal rejected');
        const target = entries.findIndex(entry => entry.key === key);
        if (target < 0) throw new Error('unknown key');
        pendingGo = target - index;
      }
    } : {}),
    back() { index -= 1; listener?.(); },
    visitNew(url: string) { entries.splice(index + 1); entries.push({ url, state: null, key: `k${++next}` }); index = entries.length - 1; listener?.(); },
    deliverGo() { if (pendingGo === undefined) throw new Error('no pending go'); index += pendingGo; pendingGo = undefined; listener?.(); },
    failReplaceWhen(predicate) { failReplace = predicate; },
    rejectTraverseTo(value) { rejectTraverse = value; }
  };
  return port;
}

export interface ChainRig {
  readonly runtime: 'production' | 'teststore';
  readonly store: Store<ChainState, ChainAction> | TestStore<ChainState, ChainAction>;
  readonly coordinator: StagedRouteCoordinator<ChainIntent>;
  readonly port: ChainPort;
  readonly trace: string[];
  readonly events: ProtocolEvent[];
  readonly diagnostics: ProtocolDiagnostic[];
  readonly history: HistoryDiagnostic[];
  readonly writePolicy: ReturnType<typeof vi.fn>;
  readonly binding: { dispose(): void } | undefined;
  dispatch(action: ChainAction): void;
  state(): ChainState;
  subscribe(listener: (state: ChainState) => void): () => void;
  txOf(handle: { readonly status: unknown }): TransactionId;
  destroy(): void;
}

export interface ChainRigOptions {
  readonly runtime?: 'production' | 'teststore';
  readonly traverseTo?: boolean;
  readonly routeKey?: (state: ChainState) => string;
  /** Registered on the store before the binding subscribes. */
  readonly exhaustivity?: 'on' | 'off';
  readonly before?: (subscribe: (listener: (state: ChainState) => void) => () => void, destroy: () => void) => void;
}

export function createChainRig(options: ChainRigOptions = {}): ChainRig {
  const runtime = options.runtime ?? 'production';
  const trace: string[] = [];
  const reducer: Reducer<ChainState, ChainAction> = (state, action) => {
    switch (action.type) {
      case 'go':
        trace.push(`go:${action.url}`);
        // A locked application refuses (vetoes) route requests, including traversals.
        return [state.locked || action.url === '/blocked' ? state : { ...state, url: action.url }, Effect.none()];
      case 'lock': return [{ ...state, locked: true }, Effect.none()];
      case 'unlock': return [{ ...state, locked: false }, Effect.none()];
      case 'tick': return [{ ...state, tick: state.tick + 1 }, Effect.none()];
      case 'replace': return [{ ...state, child: { count: 0 } }, Effect.none()];
      default: return [state, Effect.none()];
    }
  };
  const child: Reducer<{ count: number }, { type: 'inc' }> = state => [{ count: state.count + 1 }, Effect.none()];
  const composition = integrate(reducer).managed().with(chainSlot, child, { replaceOn: action => action.type === 'replace' }).build();
  const initialState: ChainState = { url: '/start', locked: false, tick: 0, child: { count: 0 } };
  const staging: ApplicationStaging<ChainState, ChainAction, ChainIntent> = {
    policy: () => true,
    commit: intent => ({ action: { type: 'go', url: intent.to }, expectedURL: intent.to }),
    routeSlot: chainSlot,
    ...(options.routeKey ? { routeKey: options.routeKey } : {})
  };
  const serialize = (state: ChainState) => state.url;
  let store: Store<ChainState, ChainAction> | TestStore<ChainState, ChainAction>;
  let coordinator: StagedRouteCoordinator<ChainIntent>;
  if (runtime === 'teststore') {
    const testStore = createTestStore<ChainState, ChainAction>({ initialState, ...composition });
    // TestStore's own adapter: its request/cue/receiveProtocol/receive API observes this coordinator.
    coordinator = testStore.enableStaging<ChainIntent>({ staging, serialize, cueMode: 'manual' });
    // Shared scenarios dispatch setup turns directly; the adapter-parity case re-enables exhaustivity.
    testStore.exhaustivity = options.exhaustivity ?? 'off';
    store = testStore;
  } else {
    const production = createStore<ChainState, ChainAction>({ initialState, ...composition });
    coordinator = createStagedCoordinator<ChainState, ChainAction, ChainIntent>({
      access: managedRootAccess(production, composition.execution),
      state: () => production.state, subscribe: listener => production.subscribe(listener),
      staging, serialize, destination: url => url, cueMode: 'manual'
    });
    coordinator.setOutletAttached(true);
    store = production;
  }
  const events: ProtocolEvent[] = [];
  const diagnostics: ProtocolDiagnostic[] = [];
  coordinator.subscribe(event => events.push(event));
  coordinator.subscribeDiagnostics(event => diagnostics.push(event));
  const port = createChainPort('/start', { traverseTo: options.traverseTo ?? false });
  const history: HistoryDiagnostic[] = [];
  const writePolicy = vi.fn((_previous: ChainState, _next: ChainState): 'push' | 'replace' => 'push');
  const subscribe = (listener: (state: ChainState) => void) => store.subscribe(listener);
  let destroyed = false;
  const destroyStore = () => { if (destroyed) return; destroyed = true; coordinator.dispose(); store.destroy(); };
  options.before?.(subscribe, destroyStore);
  let id = 0;
  const binding = bindManagedRootRoute({
    store: store as Store<ChainState, ChainAction>, execution: composition.execution, port, initial: 'accepted-state', fragment: 'native',
    serialize, request: url => ({ action: { type: 'go', url }, expectedURL: url }),
    id: () => `id-${++id}`, report: event => history.push(event), writePolicy,
    staging: eligibility => coordinator.setEligibility(eligibility)
  });
  return {
    runtime, store, coordinator, port, trace, events, diagnostics, history, writePolicy, binding,
    dispatch: action => store.dispatch(action),
    state: () => store.state,
    subscribe,
    txOf: handle => (handle.status as { transaction: TransactionId }).transaction,
    destroy: () => { binding?.dispose(); destroyStore(); }
  };
}
