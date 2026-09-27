/** Internal typed-slot routing assembly; intentionally not exported by package entry points. */
import type { Store, StoreExecutionConfig } from '../types.js';
import type { InspectionEvent } from '../execution/turn-queue.js';
import type { ManagedComposition, SlotHandle } from '../navigation/managed-integration.js';
import { childRouteAuthority, rootRouteAuthority, type RouteAuthority } from './managed-authority.js';
import type { EpochId, HistoryInvalidation, HistoryResult, HistoryTurnObservation, StagingEligibility } from './staged/types.js';
import { connectManagedHistory, type HistoryPort, type HistoryMetadataCodec, type HistoryDiagnostic, type ManagedHistoryConnection, type TraversalResult } from './managed-history.js';
import type { RouteScrollHooks, ScrollCause, ScrollPolicy } from './scroll-restoration.js';
/** Internal scroll ownership: the binding stays the only history writer and drives the hooks around its writes. */
export interface RouteScrollOwnership<C> {
    readonly hooks: RouteScrollHooks;
    readonly policy: (previous: C, next: C, cause: ScrollCause) => ScrollPolicy;
}
export interface RouteRequest<A> {
    readonly action: A;
    readonly expectedURL: string;
}
/** Server callers can prepare the same request without reading a DOM global or dispatching work. */
export function planManagedRoute<A>(url: string, request: (url: string) => RouteRequest<A> | undefined): RouteRequest<A> | undefined {
    return request(url);
}
interface RouteConfiguration<C, CA> {
    readonly port: HistoryPort;
    readonly initial: 'accepted-state' | 'request-url';
    readonly fragment?: 'route' | 'native' | undefined;
    readonly serialize: (state: C) => string;
    readonly request: (url: string) => RouteRequest<CA> | undefined;
    readonly id: () => string;
    readonly codec?: HistoryMetadataCodec | undefined;
    readonly report: (event: HistoryDiagnostic) => void;
    readonly writePolicy?: ((previous: C, next: C) => 'push' | 'replace') | undefined;
    /** Internal staging eligibility publication: the attached epoch's port, then undefined when it ends. */
    readonly staging?: ((eligibility: StagingEligibility | undefined) => void) | undefined;
    readonly scroll?: RouteScrollOwnership<C> | undefined;
    readonly classify?: ((input: {
        readonly previousURL: string;
        readonly expectedURL: string;
        readonly acceptedURL: string;
    }) => TraversalResult['outcome']) | undefined;
}
export interface ManagedRouteOptions<S, A, D, C, CA> extends RouteConfiguration<C, CA> {
    readonly store: Store<S, A>;
    readonly composition: ManagedComposition<S, A, D>;
    readonly slot: SlotHandle<S, A, C, CA>;
}
interface AttachmentObserver {
    readonly ready?: (() => void) | undefined;
    readonly failed?: ((error: unknown) => void) | undefined;
}
export interface ManagedRootRouteOptions<S, A, D> extends RouteConfiguration<NoInfer<S>, NoInfer<A>> {
    readonly store: Store<S, A>;
    readonly execution: StoreExecutionConfig<S, A, D>;
    /** Internal application attachment receipt, never a consumer lifecycle hook. */
    readonly _attachment?: AttachmentObserver | undefined;
}
/** Committed root turns; an owner whose own state is unchanged still needs one to retry a browser write. */
interface TurnSignal {
    readonly current: () => unknown;
    readonly subscribe: (listener: (state: unknown) => void) => () => void;
}
const storeTurns = <S, A>(store: Store<S, A>): TurnSignal => ({ current: () => store.state, subscribe: listener => store.subscribe(listener) });
export function bindManagedRootRoute<S, const A, D>(options: ManagedRootRouteOptions<S, A, D>) {
    return bindRouteAuthority(rootRouteAuthority(options.store, options.execution), options, storeTurns(options.store), options._attachment);
}
/** Connection and queued responses retain the original slot owner, never its replacement. */
export function bindManagedRoute<S, A, D, C, const CA>(options: ManagedRouteOptions<S, A, D, C, CA>): {
    dispose(): void;
} | undefined {
    const authority = childRouteAuthority(options.store, options.composition, options.slot);
    return authority ? bindRouteAuthority(authority, options, storeTurns(options.store)) : undefined;
}
let epochCounter = 0;
function bindRouteAuthority<C, CA>(authority: RouteAuthority<C, CA>, options: RouteConfiguration<C, CA>, turns: TurnSignal, attachment?: AttachmentObserver) {
    const initial = authority.read();
    if (!initial)
        return undefined;
    const projectURL = (url: string) => options.fragment === 'native' ? url.split('#')[0]! : url;
    const serialize = (state: C) => projectURL(options.serialize(state));
    let acceptedState = initial.state;
    let acceptedURL = serialize(acceptedState);
    const record = authority.register();
    let connection: ManagedHistoryConnection | undefined;
    let writeFailed = false;
    // Only a failed physical write or reconciliation rebase re-arms on later committed turns;
    // policy and serialization failures keep retrying on a later accepted state update.
    let retryAfter: { readonly state: unknown } | undefined;
    let rebaseFailed = false;
    let stopTurns: (() => void) | undefined;
    let stopState: (() => void) | undefined;
    let initializationFailure: unknown;
    let hasInitializationFailure = false;
    let receiptSettled = false;
    let attachmentFailed = false;
    const report = (event: HistoryDiagnostic) => {
        if (event.type === 'historyFailure' && event.operation === 'initialize') {
            hasInitializationFailure = true;
            initializationFailure = event.error;
            if (authority.kind === 'root' && record.live) fail(event.error);
        }
        if (event.type === 'historyFailure' && event.operation === 'write' && !receiptSettled && authority.kind === 'root' && record.live) fail(event.error);
        try {
            options.report(event);
        }
        catch { /* Diagnostic observers do not own acceptance. */ }
    };
    const fail = (error: unknown) => {
        if (attachmentFailed)
            return;
        attachmentFailed = true;
        receiptSettled = true;
        record.dispose();
        try {
            const result: unknown = attachment?.failed?.(error);
            void Promise.resolve(result).catch(observerError => {
                report({ type: 'historyFailure', operation: 'initialize', error: observerError });
            });
        }
        catch (observerError) {
            report({ type: 'historyFailure', operation: 'initialize', error: observerError });
        }
    };
    // Staging eligibility (I2). The staged generation is distinct from the connection's counter.
    let epoch: EpochId | undefined;
    let stagedGeneration = 0;
    let openTraversals = 0;
    let correctionOpen = false;
    let uncertain = false;
    // Every entry into uncertainty (even while already uncertain) advances the epoch. Only evidence observed at or
    // after the latest failure may clear it: an older traversal settling later proves nothing about a newer failure.
    let uncertaintyEpoch = 0;
    let lastTurn: { readonly state: unknown; readonly result: HistoryResult } | undefined;
    /** The open exact-turn observation, if a staged/degraded commit action is reserved. */
    let observing: { recorded: { readonly state: unknown; readonly result: HistoryResult } | undefined } | undefined;
    const recordTurn = (state: unknown, result: HistoryResult) => {
        lastTurn = { state, result };
        if (observing) observing.recorded = lastTurn;
    };
    const invalidationListeners = new Set<(cause: HistoryInvalidation) => void>();
    const invalidate = (cause: HistoryInvalidation) => {
        for (const listener of [...invalidationListeners]) {
            try { listener(cause); } catch (error) { report({ type: 'historyFailure', operation: 'traverse', error }); }
        }
    };
    const enterUncertain = () => { uncertaintyEpoch++; if (uncertain) return; uncertain = true; invalidate('historyUnavailable'); };
    const eligibility: StagingEligibility = {
        epoch: () => live() && connection !== undefined ? epoch : undefined,
        generation: () => stagedGeneration,
        eligibility: () => !live() || connection === undefined || epoch === undefined ? 'noBinding'
            : uncertain ? 'historyUncertain' : openTraversals > 0 || correctionOpen ? 'historyBarrier' : 'ok',
        onInvalidate: listener => { invalidationListeners.add(listener); return () => { invalidationListeners.delete(listener); }; },
        // Evidence for the exact committed state. A retired binding that never recorded the turn cannot
        // prove no write was due; a live binding not notified saw no state change, so no write was due.
        historyResult: state => lastTurn !== undefined && Object.is(lastTurn.state, state) ? lastTurn.result : live() ? 'unchanged' : 'failed',
        observeTurn: (): HistoryTurnObservation => {
            const turn: { recorded: { readonly state: unknown; readonly result: HistoryResult } | undefined } = { recorded: undefined };
            observing = turn;
            return {
                result: state => {
                    if (observing === turn) observing = undefined;
                    const recorded = turn.recorded;
                    if (recorded !== undefined && Object.is(recorded.state, state)) return recorded.result;
                    return live() ? 'unchanged' : 'failed';
                }
            };
        }
    };
    const scroll = options.scroll;
    const scrollCall = (run: (hooks: RouteScrollHooks) => void) => {
        if (!scroll) return;
        // Scroll is presentation: its failures are diagnostics only and never fail attachment or history state.
        try { run(scroll.hooks); } catch (error) { try { options.report({ type: 'historyFailure', operation: 'write', error }); } catch { /* Diagnostics cannot change control flow. */ } }
    };
    const scrollCommit = (previous: C, next: C, cause: ScrollCause) => scrollCall(hooks => {
        hooks.entryChanged();
        hooks.request(scroll!.policy(previous, next, cause));
    });
    record.addCleanup(() => {
        stopState?.(); stopTurns?.();
        // Flush and restore the recorded mode while the current entry is still this binding's.
        if (connection) scrollCall(hooks => hooks.detached());
        connection?.dispose();
        if (epoch !== undefined) {
            epoch = undefined;
            invalidate('detached');
            try { options.staging?.(undefined); } catch (error) { report({ type: 'historyFailure', operation: 'initialize', error }); }
        }
        invalidationListeners.clear();
    });
    const live = () => record.live && authority.isLive();
    const submit = (rawURL: string, done: (result: TraversalResult, failure?: {
        error: unknown;
    }) => boolean | void) => {
        if (!live())
            return;
        const url = projectURL(rawURL);
        const observedEpoch = uncertaintyEpoch;
        const stateAtObservation = acceptedState;
        // Synchronous classification before the inspection is enqueued.
        let routeAffecting = false;
        let barrierReleased = false;
        const routeSteps = () => {
            if (routeAffecting) return;
            routeAffecting = true;
            stagedGeneration++;
            openTraversals++;
            invalidate('traversal');
        };
        const releaseBarrier = () => { if (routeAffecting && !barrierReleased) { barrierReleased = true; openTraversals--; } };
        if (!(options.fragment === 'native' && url === acceptedURL)) routeSteps();
        const settleTraversal = done;
        done = (result, failure) => {
            try {
                // Clearing needs positive evidence: this settlement itself left the current browser entry carrying the
                // accepted entry, and no uncertainty was entered after this traversal was observed.
                const established = settleTraversal(result, failure) === true;
                if (!failure && result.outcome !== 'rejected' && established && uncertaintyEpoch === observedEpoch && !correctionOpen) uncertain = false;
                // Same-route traversals restore through this settlement even when no domain action or render occurs.
                // A route traversal that dispatched its domain action is a semantic commit (application policy); physical
                // same-route movement without one restores by entry identity only.
                if (established && !failure && result.outcome !== 'rejected' && connection) {
                    if (routeAffecting && request !== undefined) scrollCommit(stateAtObservation, acceptedState, 'traversal');
                    else scrollCall(hooks => { hooks.entryChanged(); hooks.physical(); });
                }
                return established;
            } finally { releaseBarrier(); }
        };
        let request: RouteRequest<CA> | undefined;
        let reportedRejection = false;
        let rejection: unknown;
        let enqueued = false;
        const resolve = () => {
            if (!live())
                return undefined;
            if (options.fragment === 'native' && url === acceptedURL)
                return undefined;
            // Reclassification at settlement: an earlier turn changed the accepted URL.
            routeSteps();
            request = options.request(url);
            return !live() || request === undefined ? undefined : { action: request.action };
        };
        const observed = (event: InspectionEvent<unknown, unknown>) => {
            if (!live())
                return;
            const previousURL = acceptedURL;
            const snapshot = authority.read();
            if (snapshot === undefined || event.type === 'dropped' || event.type === 'inspection-dropped') {
                releaseBarrier();
                return;
            }
            const state = snapshot.state;
            if (event.type === 'rejected' || event.type === 'inspection-rejected') {
                reportedRejection = true;
                rejection = event.error;
                done({ outcome: 'rejected', acceptedURL: previousURL }, { error: event.error });
                report({ type: 'historyFailure', operation: 'traverse', error: event.error });
                return;
            }
            if (event.type === 'skipped') {
                done({ outcome: url === acceptedURL ? 'accepted' : 'rejected', acceptedURL });
                return;
            }
            acceptedState = state;
            let projected = false;
            try {
                const nextURL = serialize(state);
                projected = true;
                const outcome = options.classify?.({ previousURL, expectedURL: request!.expectedURL, acceptedURL: nextURL }) ??
                    (nextURL === request!.expectedURL ? 'accepted' : nextURL === previousURL ? 'rejected' : 'redirected');
                acceptedURL = nextURL;
                done({ outcome, acceptedURL: nextURL });
            }
            catch (error) {
                // The traversal turn committed a state that history cannot reflect (its URL cannot be projected, or its
                // classification failed and the browser is rebased to the previous URL): domain and physical history are
                // unreconciled. An unprojectable state retries on a later accepted state, like a failed write.
                if (!projected) { writeFailed = true; retryAfter = undefined; }
                enterUncertain();
                done({ outcome: 'rejected', acceptedURL: previousURL }, { error });
                report({ type: 'historyFailure', operation: 'traverse', error });
            }
        };
        try {
            if (authority.kind === 'root' || options.fragment === 'native') {
                enqueued = true;
                authority.inspect(resolve, observed);
            }
            else {
                const resolved = resolve();
                if (resolved === undefined)
                    done({ outcome: 'rejected', acceptedURL });
                else {
                    enqueued = true;
                    authority.enqueue(resolved.action, observed);
                }
            }
        }
        catch (error) {
            if (!reportedRejection || !Object.is(error, rejection)) {
                if (enqueued)
                    throw error;
                done({ outcome: 'rejected', acceptedURL }, { error });
                report({ type: 'historyFailure', operation: 'traverse', error });
            }
        }
    };
    const attach = () => {
        if (!live())
            return;
        connection = connectManagedHistory({ port: options.port, acceptedURL, id: options.id,
            ...(options.fragment ? { fragment: options.fragment } : {}),
            ...(options.codec ? { codec: options.codec } : {}), report, traverse: submit,
            rebaseFailed: () => { writeFailed = true; rebaseFailed = true; retryAfter = { state: turns.current() }; enterUncertain(); },
            traversalFailed: phase => {
                if (phase === 'observation') {
                    // Observed but unprocessable: conservatively route-affecting (cancel before any later cue).
                    stagedGeneration++;
                    invalidate('traversal');
                }
                enterUncertain();
            },
            correction: signal => {
                if (signal === 'started') correctionOpen = true;
                else if (signal === 'failed') { correctionOpen = false; enterUncertain(); }
                else { correctionOpen = false; if (signal === 'reestablished') uncertain = false; }
            } });
        if (!connection) {
            if (authority.kind === 'root')
                fail(hasInitializationFailure ? initializationFailure : new Error('Managed route initialization failed'));
            else
                record.dispose();
            return;
        }
        if (!live()) {
            connection.dispose();
            return;
        }
        const accept = (state: C) => {
            recordTurn(state, 'unchanged');
            if (state === acceptedState && !writeFailed)
                return;
            let projectedURL: string | undefined;
            try {
                const previous = acceptedState;
                acceptedState = state;
                const nextURL = serialize(state);
                if (nextURL === acceptedURL && !writeFailed)
                    return;
                acceptedURL = nextURL;
                projectedURL = nextURL;
                // An unchanged state is the pure retry of a failed rebase, which replaces the visited entry.
                const replace = (rebaseFailed && state === previous) || options.writePolicy?.(previous, state) === 'replace';
                let physicalWriteFailed = false;
                // The departing entry's position is persisted onto it immediately before a push.
                if (!replace) scrollCall(hooks => hooks.beforePush());
                writeFailed = connection?.accepted(nextURL, replace, () => { physicalWriteFailed = true; }) !== true;
                if (!writeFailed) scrollCommit(previous, state, replace ? 'replace' : 'push');
                rebaseFailed = rebaseFailed && writeFailed;
                retryAfter = physicalWriteFailed ? { state: turns.current() } : undefined;
                recordTurn(state, writeFailed ? 'failed' : 'written');
                if (writeFailed) enterUncertain();
                else uncertain = false;
            }
            catch (error) {
                writeFailed = true;
                retryAfter = undefined;
                if (projectedURL !== undefined)
                    connection?.unwritten(projectedURL);
                recordTurn(state, 'failed');
                report({ type: 'historyFailure', operation: 'write', error });
                enterUncertain();
            }
        };
        stopState = authority.subscribe(snapshot => {
            if (live() && snapshot !== undefined)
                accept(snapshot.state);
        });
        // Committed turns that leave this owner's state untouched still retry an outstanding browser write.
        stopTurns = turns.subscribe(state => {
            if (retryAfter === undefined || Object.is(state, retryAfter.state))
                return;
            const snapshot = authority.read();
            if (live() && snapshot !== undefined)
                accept(snapshot.state);
        });
        // subscribe may synchronously notify and retire this attachment.
        if (!live()) {
            stopState();
            stopTurns();
            return;
        }
        scrollCall(hooks => hooks.attached());
        epoch = ++epochCounter as EpochId;
        try { options.staging?.(eligibility); } catch (error) { report({ type: 'historyFailure', operation: 'initialize', error }); }
        if (!receiptSettled) {
            receiptSettled = true;
            try {
                const result: unknown = attachment?.ready?.();
                // The framework contract is synchronous. Observe malformed thenables
                // without allowing a rejected callback to escape the attachment.
                void Promise.resolve(result).catch(error => {
                    if (live()) fail(error);
                    report({ type: 'historyFailure', operation: 'initialize', error });
                });
            }
            catch (error) {
                fail(error);
                report({ type: 'historyFailure', operation: 'initialize', error });
            }
        }
    };
    try {
        if (options.initial === 'accepted-state')
            attach();
        else
            submit(options.port.read().url, (_result, failure) => {
                if (authority.kind === 'root' && failure)
                    fail(failure.error);
                else
                    attach();
            });
    }
    catch (error) {
        record.dispose();
        report({ type: 'historyFailure', operation: 'initialize', error });
        fail(error);
    }
    return { dispose: () => record.dispose() };
}
