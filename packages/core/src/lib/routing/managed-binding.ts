/** Internal typed-slot routing assembly; intentionally not exported by package entry points. */
import type { Store, StoreExecutionConfig } from '../types.js';
import type { InspectionEvent } from '../execution/turn-queue.js';
import type { ManagedComposition, SlotHandle } from '../navigation/managed-integration.js';
import { childRouteAuthority, rootRouteAuthority, type RouteAuthority } from './managed-authority.js';
import { connectManagedHistory, type HistoryPort, type HistoryMetadataCodec, type HistoryDiagnostic, type ManagedHistoryConnection, type TraversalResult } from './managed-history.js';
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
    record.addCleanup(() => { stopState?.(); stopTurns?.(); connection?.dispose(); });
    const live = () => record.live && authority.isLive();
    const submit = (rawURL: string, done: (result: TraversalResult, failure?: {
        error: unknown;
    }) => void) => {
        if (!live())
            return;
        const url = projectURL(rawURL);
        let request: RouteRequest<CA> | undefined;
        let reportedRejection = false;
        let rejection: unknown;
        let enqueued = false;
        const resolve = () => {
            if (!live())
                return undefined;
            if (options.fragment === 'native' && url === acceptedURL)
                return undefined;
            request = options.request(url);
            return !live() || request === undefined ? undefined : { action: request.action };
        };
        const observed = (event: InspectionEvent<unknown, unknown>) => {
            if (!live())
                return;
            const previousURL = acceptedURL;
            const snapshot = authority.read();
            if (snapshot === undefined || event.type === 'dropped' || event.type === 'inspection-dropped')
                return;
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
            try {
                const nextURL = serialize(state);
                const outcome = options.classify?.({ previousURL, expectedURL: request!.expectedURL, acceptedURL: nextURL }) ??
                    (nextURL === request!.expectedURL ? 'accepted' : nextURL === previousURL ? 'rejected' : 'redirected');
                acceptedURL = nextURL;
                done({ outcome, acceptedURL: nextURL });
            }
            catch (error) {
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
            rebaseFailed: () => { writeFailed = true; rebaseFailed = true; retryAfter = { state: turns.current() }; } });
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
                writeFailed = connection?.accepted(nextURL, replace, () => { physicalWriteFailed = true; }) !== true;
                rebaseFailed = rebaseFailed && writeFailed;
                retryAfter = physicalWriteFailed ? { state: turns.current() } : undefined;
            }
            catch (error) {
                writeFailed = true;
                retryAfter = undefined;
                if (projectedURL !== undefined)
                    connection?.unwritten(projectedURL);
                report({ type: 'historyFailure', operation: 'write', error });
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
