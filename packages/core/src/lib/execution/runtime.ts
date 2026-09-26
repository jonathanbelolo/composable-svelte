/** Shared execution runtime for Composable Svelte effects. */
import type { Effect, Dispatch } from '../types.js';
import type { ExecutionScheduler, TimerHandle } from './scheduler.js';
import { createResourceScope, type ResourceScope, type ResourceRecord, type ResourceOutcome, type ResourceRecordOptions } from './resources.js';
import type { Lifecycle, OwnerToken } from './identity.js';
import { isOwnerLive, qualifyEffect } from './identity.js';
/** Read-only lifecycle events, shared by production diagnostics and the TestStore adapter. */
export type RuntimeEvent = {
    readonly type: 'started';
    readonly record: ResourceRecord;
} | {
    readonly type: 'settled';
    readonly record: ResourceRecord;
} | {
    readonly type: 'dropped';
    readonly origin: OwnerToken | undefined;
    readonly phase: 'enqueue' | 'dequeue' | 'execute' | 'callback';
    readonly reason: ResourceOutcome | 'scope-disposed' | 'stale-owner';
} | {
    readonly type: 'failure';
    readonly error: unknown;
    readonly phase: 'execution' | 'cleanup' | 'reduction';
};
/** History is a bounded projection, not a resource or exception retention root. */
export type RuntimeDiagnostic = ({ readonly type: 'started' } | { readonly type: 'settled' }) & {
    readonly record: Readonly<{ uid: number; id: string | undefined; groups: readonly string[]; ownerId: number | undefined; description: string | undefined; outcome: ResourceOutcome }>;
} | {
    readonly type: 'dropped';
    readonly ownerId: number | undefined;
    readonly phase: 'enqueue' | 'dequeue' | 'execute' | 'callback';
    readonly reason: ResourceOutcome | 'scope-disposed' | 'stale-owner';
} | {
    readonly type: 'failure';
    readonly error: Readonly<{ name: string; message: string }>;
    readonly phase: 'execution' | 'cleanup' | 'reduction';
};
/** Managed root channel admission failed; existing histories are never evicted. */
export class RootThrottleCapacityError extends Error {
    readonly capacity: number;
    constructor(capacity: number) {
        super(`Managed root throttle history capacity (${capacity}) exceeded`);
        this.name = 'RootThrottleCapacityError';
        this.capacity = capacity;
    }
}
interface ThrottleHistory {
    lastRun: number;
    timerRecord?: ResourceRecord;
    origin?: OwnerToken | undefined;
    groups?: readonly string[] | undefined;
}
export interface EffectRuntimeOptions<Action> {
    readonly scheduler: ExecutionScheduler;
    readonly rootThrottleCapacity?: number | undefined;
    readonly dispatch: (action: Action, origin?: OwnerToken) => void;
    readonly ssr?: {
        readonly deferEffects?: boolean;
    } | undefined;
    readonly isServer?: (() => boolean) | undefined;
    readonly onEvent?: ((event: RuntimeEvent) => void) | undefined;
    readonly onError?: ((error: unknown, context?: string) => void) | undefined;
}
export class EffectRuntime<Action> {
    private readonly schedulerInstance: ExecutionScheduler;
    private readonly resourceScopeInstance: ResourceScope;
    private readonly options: EffectRuntimeOptions<Action>;
    private readonly throttleState = new Map<string, ThrottleHistory>();
    private readonly rootThrottleCapacity: number;
    private rootThrottleCount = 0;
    private readonly observers = new Set<(event: RuntimeEvent) => void>();
    // At most 100 lifecycle projections and 100 incidents; payload strings and
    // group counts are capped independently. Live observers receive full events.
    private readonly lifecycleHistory: Array<{ sequence: number; event: RuntimeDiagnostic }> = [];
    private readonly incidentHistory: Array<{ sequence: number; event: RuntimeDiagnostic }> = [];
    private readonly diagnosticIds = new WeakMap<ResourceRecord, number>();
    private nextDiagnosticId = 1;
    private diagnosticSequence = 0;
    private disposed = false;
    constructor(options: EffectRuntimeOptions<Action>) {
        const capacity = options.rootThrottleCapacity === undefined ? 1024 : options.rootThrottleCapacity;
        if (!Number.isSafeInteger(capacity) || capacity <= 0)
            throw new TypeError('rootThrottleCapacity must be a finite positive safe integer');
        this.rootThrottleCapacity = capacity;
        this.options = options;
        this.schedulerInstance = options.scheduler;
        this.resourceScopeInstance = createResourceScope({
            onRegistered: record => { this.track(record); },
            onCleanupError: error => this.reportFailure(error, 'cleanup'),
            onExecutionError: error => this.reportFailure(error, 'execution')
        });
    }
    get scheduler(): ExecutionScheduler {
        return this.schedulerInstance;
    }
    get resourceScope(): ResourceScope {
        return this.resourceScopeInstance;
    }
    get isServer(): boolean { return this.options.isServer?.() ?? false; }
    get isDisposed(): boolean {
        return this.disposed || this.resourceScopeInstance.isDisposed;
    }
    get pendingWorkCount(): number {
        return this.resourceScopeInstance.size + this.resourceScopeInstance.pendingCleanupCount;
    }
    async whenCleanupsSettled(): Promise<void> {
        await this.resourceScopeInstance.whenCleanupsSettled();
    }
    get diagnostics(): readonly RuntimeDiagnostic[] {
        return [...this.lifecycleHistory, ...this.incidentHistory].sort((a,b) => a.sequence-b.sequence).map(entry => entry.event);
    }
    private project(event: RuntimeEvent): RuntimeDiagnostic {
        if (event.type === 'started' || event.type === 'settled') {
            const record = event.record;
            let uid = this.diagnosticIds.get(record);
            if (uid === undefined) { uid = this.nextDiagnosticId++; this.diagnosticIds.set(record, uid); }
            return Object.freeze({ type: event.type, record: Object.freeze({ uid,
                id: record.id?.slice(0,1024), groups: Object.freeze(record.groups.slice(0,16).map(group => group.slice(0,1024))),
                ownerId: (record.ownerToken as OwnerToken | undefined)?.id,
                description: record.description?.slice(0,1024), outcome: record.outcome }) });
        }
        if (event.type === 'dropped') return Object.freeze({ type: event.type, ownerId: event.origin?.id, phase: event.phase, reason: event.reason });
        let name = 'Error', message = 'Unknown error';
        try {
            if (typeof event.error === 'string') message = event.error.slice(0,2048);
            else if (event.error && typeof event.error === 'object') {
                const error = event.error as { name?: unknown; message?: unknown };
                if (typeof error.name === 'string') name = error.name.slice(0,128);
                if (typeof error.message === 'string') message = error.message.slice(0,2048);
            }
        } catch { /* Arbitrary thrown objects may contain hostile getters. */ }
        return Object.freeze({ type: event.type, phase: event.phase, error: Object.freeze({ name, message }) });
    }
    observe(listener: (event: RuntimeEvent) => void): () => void {
        this.observers.add(listener);
        return () => this.observers.delete(listener);
    }
    private emit(event: RuntimeEvent): void {
        const history = event.type === 'started' || event.type === 'settled' ? this.lifecycleHistory : this.incidentHistory;
        history.push({ sequence: this.diagnosticSequence++, event: this.project(event) });
        if (history.length > 100) history.shift();
        for (const listener of [this.options.onEvent, ...this.observers]) {
            try {
                void Promise.resolve(listener?.(event)).catch(error => this.reportError(error, 'observer'));
            }
            catch (error) {
                this.reportError(error, 'observer');
            }
        }
    }
    private reportError(error: unknown, context: string): void {
        try {
            void Promise.resolve(this.options.onError?.(error, context)).catch(() => { });
        }
        catch { /* Diagnostics never own teardown. */ }
    }
    reportFailure(error: unknown, phase: 'execution' | 'cleanup' | 'reduction'): void {
        this.emit({ type: 'failure', error, phase });
        this.reportError(error, phase);
    }
    reportDrop(origin: OwnerToken | undefined, phase: 'enqueue' | 'dequeue' | 'execute' | 'callback', reason: ResourceOutcome | 'scope-disposed' | 'stale-owner' = 'stale-owner'): void {
        this.emit({ type: 'dropped', origin, phase, reason });
    }
    private track(record: ResourceRecord): ResourceRecord {
        this.emit({ type: 'started', record });
        void record.logicalSettlement.then(() => this.emit({ type: 'settled', record }));
        return record;
    }
    /** Publish ownership before entering even a synchronous custom scheduler. */
    private armTimer(delay: number, options: Omit<ResourceRecordOptions, 'cleanup'>, fire: () => void, prepare?: (record: ResourceRecord) => void): ResourceRecord {
        let handle: TimerHandle | undefined;
        let cleared = false;
        const record = this.resourceScopeInstance.registerTimer({ ...options, kind: 'timer', clear: () => {
            cleared = true;
            if (handle) this.schedulerInstance.clearTimer(handle);
        }});
        if (!record.live || this.isDisposed) return record;
        prepare?.(record);
        try {
            handle = this.schedulerInstance.setTimer(delay, () => {
                // Resource ownership is the deferred liveness authority. The
                // lifecycle snapshot used to qualify this effect cannot change.
                if (!record.live || this.isDisposed) return;
                this.resourceScopeInstance.complete(record);
                fire();
            });
            if (cleared) this.schedulerInstance.clearTimer(handle);
        } catch (error) {
            record.dispose();
            throw error;
        }
        return record;
    }
    private admitThrottle(id: string, origin: OwnerToken | undefined): void {
        const previous = this.throttleState.get(id);
        if (origin === undefined && (!previous || previous.origin !== undefined) &&
            this.rootThrottleCount >= this.rootThrottleCapacity)
            throw new RootThrottleCapacityError(this.rootThrottleCapacity);
    }
    private setThrottle(id: string, state: ThrottleHistory): void {
        this.admitThrottle(id, state.origin);
        const previous = this.throttleState.get(id);
        if (previous && previous.origin === undefined) this.rootThrottleCount--;
        this.throttleState.set(id, state);
        if (state.origin === undefined) this.rootThrottleCount++;
    }
    private deleteThrottle(id: string): void {
        const previous = this.throttleState.get(id);
        if (!previous) return;
        this.throttleState.delete(id);
        if (previous.origin === undefined) this.rootThrottleCount--;
    }
    private namedWorkGroup(id: string): string { return JSON.stringify(['runtime-named-work', id]); }
    cancel(id: string): void {
        const previous = this.throttleState.get(id);
        this.deleteThrottle(id);
        previous?.timerRecord?.dispose();
        this.resourceScopeInstance.cancel(id);
        this.resourceScopeInstance.cancelGroup(this.namedWorkGroup(id));
    }
    cancelGroup(group: string): void {
        for (const [id, state] of this.throttleState)
            if (state.groups?.includes(group)) {
                state.timerRecord?.dispose();
                // Cancelling work does not reset the already-observed rate window.
                if (this.throttleState.get(id) === state)
                    this.setThrottle(id, { lastRun: state.lastRun, origin: state.origin, groups: state.groups });
            }
        this.resourceScopeInstance.cancelGroup(group);
    }
    cancelOwner(token: unknown): void {
        if (token === undefined || token === null)
            return;
        for (const [id, state] of this.throttleState)
            if (state.origin === token) {
                this.deleteThrottle(id);
                state.timerRecord?.dispose();
            }
        this.resourceScopeInstance.cancelOwner(token);
    }
    dispose(): void {
        if (this.disposed)
            return;
        this.disposed = true;
        this.throttleState.clear();
        this.rootThrottleCount = 0;
        this.resourceScopeInstance.dispose();
    }
    executeEffect(effect: Effect<Action>, lifecycle?: Lifecycle): void {
        if (this.isDisposed)
            return;
        const deferEffects = this.options.ssr?.deferEffects ?? true;
        if (this.options.isServer?.() && deferEffects) {
            return;
        }
        if (lifecycle)
            this.diagnoseInvalidated(effect, lifecycle);
        // Qualification happens at this one entry boundary for each execution, never on reusable descriptions.
        try {
            this.executeQualified(lifecycle ? qualifyEffect(effect, lifecycle) : effect, lifecycle);
        }
        catch (error) {
            this.reportFailure(error, 'execution');
        }
    }
    private diagnoseInvalidated(effect: Effect<Action>, lifecycle: Lifecycle, inherited?: OwnerToken): void {
        const origin = effect.origin ?? inherited;
        if (effect._tag === 'Batch') {
            for (const member of effect.effects)
                this.diagnoseInvalidated(member, lifecycle, origin);
        }
        else if (effect._tag !== 'None' && !isOwnerLive(lifecycle, origin)) {
            this.reportDrop(origin, 'execute');
        }
    }
    private executeQualified(effect: Effect<Action>, lifecycle?: Lifecycle): void {
        if (this.isDisposed)
            return;
        switch (effect._tag) {
            case 'None':
                break;
            case 'CancelGroup':
                this.cancelGroup(effect.group);
                break;
            case 'Batch':
                for (const member of effect.effects) {
                    try { this.executeQualified(member, lifecycle); }
                    catch (error) { this.reportFailure(error, 'execution'); }
                }
                break;
            case 'FireAndForget':
                this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                    ownerToken: effect.origin,
                    execute: () => effect.execute(),
                    dispatch: () => { }
                });
                break;
            case 'Cancellable':
                if (effect.cancelOnly) {
                    this.cancel(effect.id);
                    break;
                }
                this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                    id: effect.id,
                    groups: effect.groups,
                    ownerToken: effect.origin,
                    execute: effect.execute,
                    onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                    dispatch: action => this.options.dispatch(action, effect.origin)
                });
                break;
            case 'Run':
                this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                    groups: effect.groups,
                    ownerToken: effect.origin,
                    execute: effect.execute,
                    onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                    dispatch: action => this.options.dispatch(action, effect.origin)
                });
                break;
            case 'Subscription':
                this.resourceScopeInstance.registerSubscription({
                    kind: 'subscription', description: effect._tag,
                    id: effect.id,
                    groups: effect.groups,
                    ownerToken: effect.origin,
                    setup: effect.setup,
                    onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                    dispatch: action => this.options.dispatch(action, effect.origin)
                });
                break;
            case 'Debounced': {
                this.armTimer(effect.ms, {
                    description: effect._tag,
                    id: effect.id,
                    groups: effect.groups,
                    ownerToken: effect.origin
                }, () => {
                    this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                        groups: [...(effect.groups ?? []), this.namedWorkGroup(effect.id)],
                        ownerToken: effect.origin,
                        execute: effect.execute,
                        onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                        dispatch: action => this.options.dispatch(action, effect.origin)
                    });
                });
                break;
            }
            case 'Throttled': {
                this.admitThrottle(effect.id, effect.origin);
                const now = this.schedulerInstance.now();
                const throttle = this.throttleState.get(effect.id);
                if (!throttle || now - throttle.lastRun >= effect.ms) {
                    if (throttle?.timerRecord) {
                        throttle.timerRecord.dispose();
                    }
                    if (this.isDisposed) return;
                    this.setThrottle(effect.id, { lastRun: now, origin: effect.origin, groups: effect.groups });
                    this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                        groups: [...(effect.groups ?? []), this.namedWorkGroup(effect.id)],
                        ownerToken: effect.origin,
                        execute: effect.execute,
                        onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                        dispatch: action => this.options.dispatch(action, effect.origin)
                    });
                }
                else if (!throttle.timerRecord || !throttle.timerRecord.live) {
                    const delay = effect.ms - (now - throttle.lastRun);
                    this.armTimer(delay, {
                        description: effect._tag,
                        id: effect.id,
                        groups: effect.groups,
                        ownerToken: effect.origin
                    }, () => {
                        this.setThrottle(effect.id, { lastRun: this.schedulerInstance.now(), origin: effect.origin, groups: effect.groups });
                        this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                            groups: [...(effect.groups ?? []), this.namedWorkGroup(effect.id)],
                            ownerToken: effect.origin,
                            execute: effect.execute,
                            onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                            dispatch: action => this.options.dispatch(action, effect.origin)
                        });
                    }, timerRecord => {
                        this.setThrottle(effect.id, { lastRun: throttle.lastRun, timerRecord, origin: effect.origin, groups: effect.groups });
                    });
                }
                break;
            }
            case 'AfterDelay': {
                this.armTimer(effect.ms, {
                    description: effect._tag,
                    groups: effect.groups,
                    ownerToken: effect.origin
                }, () => {
                    this.resourceScopeInstance.runCancellable({
                    kind: 'execution', description: effect._tag,
                        groups: effect.groups,
                        ownerToken: effect.origin,
                        execute: effect.execute,
                        onDroppedDispatch: reason => this.reportDrop(effect.origin, 'callback', reason),
                        dispatch: action => this.options.dispatch(action, effect.origin)
                    });
                });
                break;
            }
            default: {
                const _exhaustive: never = effect;
                throw new Error(`Unhandled effect type: ${(_exhaustive as any)._tag}`);
            }
        }
    }
}
