/** Managed turn queue foundation for Composable Svelte. */
import type { Reducer, Selector, StoreExecutionConfig, Effect, ManagedReductionAdapter, CreatedOwnerEffect, OwnerActionDelivery } from '../types.js';
import type { Lifecycle, SlotDescriptor, OwnerToken, Reconciliation, ReplaceIntent } from './identity.js';
import { createLifecycle, reconcile, isOwnerLive, ownerAt, stampOrigin } from './identity.js';
import { EffectRuntime } from './runtime.js';
import type { ResourceRecord } from './resources.js';
/** Internal attachment capability; its lifetime belongs to the host resource. */
export interface InitializationClaim {
    readonly live: boolean;
    /** Framework attachment failure only; never supplied by application features. */
    readonly onFailure?: ((error: unknown) => void) | undefined;
}
interface PendingInitialization<Action> { record: ResourceRecord; readonly effect: Effect<Action>; scheduled: boolean; settling: boolean; }
type StartupDescription<State, Action, Dependencies> =
    | {readonly kind: 'action'; readonly action: Action}
    | {readonly kind: 'decision'; readonly decide: (state: State, dependencies: Dependencies) => Action | undefined};
interface PendingRootStartup<State, Action, Dependencies> {
    readonly record: ResourceRecord;
    readonly description: StartupDescription<State, Action, Dependencies>;
    scheduled: boolean;
}
type InitializationCommand<State, Action, Dependencies> =
    | { readonly control: 'activate'; readonly claim: InitializationClaim }
    | { readonly control: 'startup'; readonly startup: PendingRootStartup<State, Action, Dependencies>; readonly claim: InitializationClaim }
    | { readonly control: 'initialize'; readonly pending: PendingInitialization<Action>; readonly claim: InitializationClaim };
function assertUnstamped<Action>(description: Effect<Action>): void {
    if (description.origin !== undefined) throw new TypeError('Initialization work must not carry an existing origin');
    if (description._tag === 'Batch') for (const child of description.effects) assertUnstamped(child);
}
/** Allocate initial owners through the same pure allocator used for later turns. */
export function initializeLifecycle<S>(descriptor: SlotDescriptor<S> | undefined, initialState: S): Lifecycle {
    if (!descriptor)
        return createLifecycle();
    const empty = Symbol('uninitialized lifecycle');
    return reconcile<S | typeof empty>(createLifecycle(), empty, initialState, {
        select: state => state === empty ? [] : descriptor.select(state as S)
    }).lifecycle;
}
export interface TurnEnvelope<Action> {
    readonly action: Action;
    readonly origin?: OwnerToken | undefined;
    /** Diagnostic provenance only, never dispatch authority. 'effect' covers all runtime-owned callbacks including subscriptions. */
    readonly source?: 'external' | 'effect' | 'lifecycle' | undefined;
}
/** Internal observation of terminal turn outcomes; envelope identity is never Action equality. */
export type TurnEvent<State, Action> =
    | {readonly type: 'committed'; readonly envelope: TurnEnvelope<Action>; readonly state: State}
    | {readonly type: 'rejected'; readonly envelope: TurnEnvelope<Action>; readonly error: unknown}
    | {readonly type: 'dropped'; readonly envelope: TurnEnvelope<Action>; readonly reason: 'stale-owner' | 'destroyed'};
/** A resolved inspection reserves the next FIFO position for `action`. `settled` runs after that
 * turn's state, action and delivery notifications, before its effects; never for dropped/rejected turns. */
export interface InspectionResolution<Action> {
    readonly action: Action;
    readonly settled?: (() => void) | undefined;
    /**
     * `report`: a rejected reserved turn goes to the runtime failure sink (`reportFailure(error,
     * 'reduction')`), like effect-dispatched work, instead of being rethrown to whichever call happened to
     * drain the queue. Its observer still sees `rejected`. Default: the existing synchronous rethrow.
     */
    readonly failure?: 'throw' | 'report' | undefined;
}
/** Private FIFO inspection; a skipped inspection is not an application action. */
export type InspectionEvent<State, Action> = TurnEvent<State, Action>
    | {readonly type: 'skipped'; readonly state: State}
    | {readonly type: 'inspection-rejected'; readonly error: unknown}
    | {readonly type: 'inspection-dropped'; readonly reason: 'stale-owner' | 'destroyed'};
interface InspectionCommand<State, Action> {
    readonly control: 'inspect';
    readonly origin: OwnerToken | undefined;
    readonly resolve: () => InspectionResolution<Action> | undefined;
    readonly observer: (event: InspectionEvent<State, Action>) => void;
}
export interface TurnQueueOptions<State, Action, Dependencies = any> {
    readonly initialState: State;
    readonly reducer: Reducer<State, Action, Dependencies>;
    readonly dependencies?: Dependencies | undefined;
    readonly execution?: StoreExecutionConfig<State, Action, Dependencies> | undefined;
    readonly runtime: EffectRuntime<Action>;
    readonly maxHistorySize?: number | undefined;
    readonly onTurn?: ((event: TurnEvent<State, Action>) => void) | undefined;
    readonly onStateCommitted?: ((state: State) => void) | undefined;
    readonly onSubscriberError?: ((error: unknown) => void) | undefined;
}
export class TurnQueue<State, Action, Dependencies = any> {
    private readonly failedInitializationClaims = new WeakSet<InitializationClaim>();
    private stateValue: State;
    private lifecycleValue: Lifecycle;
    private readonly reducer: Reducer<State, Action, Dependencies>;
    private readonly dependencies: Dependencies;
    private readonly slotDescriptor: SlotDescriptor<State> | undefined;
    private readonly runtimeInstance: EffectRuntime<Action>;
    private readonly subscribers = new Set<(state: State) => void>();
    private readonly actionSubscribers = new Set<(action: Action, state: State) => void>();
    /** Post-commit deliveries of reduced child actions to their exact owners. */
    private readonly deliverySubscribers = new Set<(owner: OwnerToken, action: unknown) => void>();
    private readonly queue: (TurnEnvelope<Action> | InitializationCommand<State, Action, Dependencies> | InspectionCommand<State, Action>)[] = [];
    private readonly pendingInitialization = new Set<PendingInitialization<Action>>();
    private readonly initialization: StoreExecutionConfig<State, Action, Dependencies>['_initialization'];
    private rootStartup: PendingRootStartup<State, Action, Dependencies> | undefined;
    private attachedClaim: InitializationClaim | undefined;
    private readonly actionHistory: Action[] = [];
    private readonly maxHistorySize: number;
    private readonly reductionAdapter: ManagedReductionAdapter<State, Action, Dependencies> | undefined;
    private isDraining = false;
    private destroyed = false;
    private readonly terminalObservers = new WeakMap<TurnEnvelope<Action>, (event: TurnEvent<State, Action>) => void>();
    private readonly settlementObservers = new WeakMap<TurnEnvelope<Action>, () => void>();
    private readonly reportedFailures = new WeakSet<TurnEnvelope<Action>>();
    /** Rejection routing for one turn: runtime sink for protocol-issued reserved turns, else rethrow. */
    private rejectTurn(envelope: TurnEnvelope<Action>, error: unknown, capturedErrors: unknown[]): void {
        this.observeTurn({type: 'rejected', envelope, error});
        if (this.reportedFailures.has(envelope)) {
            this.reportedFailures.delete(envelope);
            this.runtimeInstance.reportFailure(error, 'reduction');
        }
        else capturedErrors.push(error);
    }
    private readonly onTurnSink: ((event: TurnEvent<State, Action>) => void) | undefined;
    private readonly onStateCommittedSink: ((state: State) => void) | undefined;
    private readonly onSubscriberErrorSink: (error: unknown) => void;
    constructor(options: TurnQueueOptions<State, Action, Dependencies>) {
        this.stateValue = options.initialState;
        this.reducer = options.reducer;
        this.dependencies = options.dependencies as Dependencies;
        this.slotDescriptor = options.execution?.slots;
        try { this.lifecycleValue = initializeLifecycle(this.slotDescriptor, options.initialState); }
        catch (error) { options.runtime.dispose(); throw error; }
        this.runtimeInstance = options.runtime;
        this.maxHistorySize = options.maxHistorySize ?? 100;
        this.reductionAdapter = options.execution?._reduce;
        this.onTurnSink = options.onTurn;
        this.onStateCommittedSink = options.onStateCommitted;
        this.onSubscriberErrorSink = options.onSubscriberError ?? (err => console.error(err));
        this.initialization = options.execution?._initialization;
        try {
            if (this.initialization) {
                if (this.initialization.mode !== 'attached') throw new TypeError('Unknown initialization mode');
                if (this.initialization.startup !== undefined && this.initialization.startupDecision !== undefined) throw new TypeError('Provide startup action or startupDecision, not both');
                if (this.initialization.startupDecision !== undefined && typeof this.initialization.startupDecision !== 'function') throw new TypeError('startupDecision must be a function');
                const initial = options.execution?._initial?.(this.stateValue, this.dependencies, this.lifecycleValue) ?? [];
                const effects = initial.map(entry => {
                    const owner = ownerAt(this.lifecycleValue, entry.path);
                    if (!owner) throw new TypeError('Initial work requires an existing initial owner');
                    assertUnstamped(entry.effect);
                    return stampOrigin(entry.effect, owner);
                });
                for (const effect of effects) this.stageInitialization(effect);
                const startup: StartupDescription<State, Action, Dependencies> | undefined = this.initialization.startupDecision !== undefined
                    ? {kind:'decision',decide:this.initialization.startupDecision}
                    : this.initialization.startup !== undefined ? {kind:'action',action:this.initialization.startup} : undefined;
                if (startup) this.restageRootStartup(startup);
            }
        } catch (error) { this.runtimeInstance.dispose(); throw error; }
    }
    getState(): State {
        return this.stateValue;
    }
    getLifecycle(): Lifecycle {
        return this.lifecycleValue;
    }
    get history(): ReadonlyArray<Action> {
        return this.actionHistory;
    }
    getRuntime(): EffectRuntime<Action> {
        return this.runtimeInstance;
    }
    get isDestroyed(): boolean {
        return this.destroyed;
    }
    dispatch(action: Action): void {
        this.enqueue({ action, source: 'external' });
    }
    /** Framework-only exact-turn completion, detached before arbitrary callback work. */
    enqueueObserved(action: Action, origin: OwnerToken | undefined, observer: (event: TurnEvent<State, Action>) => void): void {
        const envelope: TurnEnvelope<Action> = {action, origin, source: 'external'};
        this.terminalObservers.set(envelope, observer);
        this.enqueue(envelope);
    }
    enqueueInspection(resolve: () => InspectionResolution<Action> | undefined, origin: OwnerToken | undefined, observer: (event: InspectionEvent<State, Action>) => void): void {
        const command: InspectionCommand<State, Action> = {control:'inspect', resolve, origin, observer};
        if (this.destroyed) { this.observeInspection(command, {type:'inspection-dropped',reason:'destroyed'}); return; }
        if (origin !== undefined && !isOwnerLive(this.lifecycleValue, origin)) {
            this.runtimeInstance.reportDrop(origin, 'enqueue');
            this.observeInspection(command, {type:'inspection-dropped',reason:'stale-owner'});
            return;
        }
        this.queue.push(command);
        if (!this.isDraining) this.drain();
    }
    private observeInspection(command: InspectionCommand<State, Action>, event: InspectionEvent<State, Action>): void {
        const report = (error: unknown) => {
            try { void Promise.resolve(this.onSubscriberErrorSink(error)).catch(() => {}); } catch { /* Observer errors cannot change queue ownership. */ }
        };
        try { void Promise.resolve(command.observer(event)).catch(report); } catch (error) { report(error); }
    }
    enqueue(envelope: TurnEnvelope<Action>): void {
        if (this.destroyed) {
            this.observeTurn({type: 'dropped', envelope, reason: 'destroyed'});
            return;
        }
        if (envelope.origin !== undefined && !isOwnerLive(this.lifecycleValue, envelope.origin)) {
            this.runtimeInstance.reportDrop(envelope.origin, 'enqueue');
            this.observeTurn({type: 'dropped', envelope, reason: 'stale-owner'});
            return;
        }
        this.queue.push(envelope);
        if (this.isDraining)
            return;
        this.drain();
    }
    /** Private control work: never a business action or reducer invocation. */
    activateInitialization(claim: InitializationClaim): void {
        if (!this.initialization || this.destroyed || this.runtimeInstance.isServer || !claim.live || this.failedInitializationClaims.has(claim)) return;
        this.queue.push({ control: 'activate', claim });
        if (!this.isDraining) this.drain();
    }
    releaseInitialization(claim: InitializationClaim): void {
        if (this.attachedClaim === claim) this.attachedClaim = undefined;
    }
    private stageInitialization(effect: Effect<Action>): void {
        const record = this.runtimeInstance.resourceScope.createRecord({ kind: 'execution', ownerToken: effect.origin, description: 'Pending feature initialization' });
        const pending: PendingInitialization<Action> = { record, effect, scheduled: false, settling: false };
        if (!record.live) return;
        this.pendingInitialization.add(pending);
        this.bindPendingCleanup(pending, record);
        if (this.attachedClaim?.live) this.scheduleInitialization(pending, this.attachedClaim);
    }
    private bindPendingCleanup(pending: PendingInitialization<Action>, record: ResourceRecord): void {
        record.addCleanup(() => {
            if (pending.record === record && !pending.settling) this.pendingInitialization.delete(pending);
        });
    }
    private restageInitialization(pending: PendingInitialization<Action>): void {
        // Keep its traversal position and captured description; do not rerun a factory.
        const record = this.runtimeInstance.resourceScope.createRecord({ kind: 'execution', ownerToken: pending.effect.origin, description: 'Pending feature initialization' });
        pending.record = record;
        this.bindPendingCleanup(pending, record);
        if (!record.live) { this.pendingInitialization.delete(pending); return; }
        if (this.attachedClaim?.live) this.scheduleInitialization(pending, this.attachedClaim);
    }
    private scheduleInitialization(pending: PendingInitialization<Action>, claim: InitializationClaim): void {
        if (!pending.record.live || pending.scheduled) return;
        pending.scheduled = true;
        this.queue.push({ control: 'initialize', pending, claim });
    }
    private restageRootStartup(description: StartupDescription<State, Action, Dependencies>): void {
        if (this.destroyed || this.runtimeInstance.isDisposed) return;
        const record = this.runtimeInstance.resourceScope.createRecord({kind:'execution',description:'Pending root startup'});
        if (!record.live) return;
        const startup: PendingRootStartup<State, Action, Dependencies> = {record,description,scheduled:false};
        this.rootStartup = startup;
        if (this.attachedClaim?.live) this.scheduleRootStartup(startup,this.attachedClaim);
    }
    private scheduleRootStartup(startup: PendingRootStartup<State, Action, Dependencies>, claim: InitializationClaim): void {
        if (!startup.record.live || startup.scheduled) return;
        startup.scheduled = true;
        this.queue.push({control:'startup',startup,claim});
    }
    private runInitialization(command: InitializationCommand<State, Action, Dependencies>): void {
        if (command.control === 'activate') {
            if (!command.claim.live || this.runtimeInstance.isServer || this.failedInitializationClaims.has(command.claim)) return;
            this.attachedClaim = command.claim;
            if (this.rootStartup) this.scheduleRootStartup(this.rootStartup, command.claim);
            for (const pending of this.pendingInitialization) this.scheduleInitialization(pending, command.claim);
            return;
        }
        if (command.control === 'startup') {
            const {startup,claim} = command;
            startup.scheduled = false;
            if (this.rootStartup !== startup || !startup.record.live) return;
            if (!claim.live || this.attachedClaim !== claim) {
                if (this.attachedClaim?.live) this.scheduleRootStartup(startup,this.attachedClaim);
                return;
            }
            this.rootStartup = undefined;
            this.runtimeInstance.resourceScope.complete(startup.record);
            if (this.destroyed || this.runtimeInstance.isDisposed) return;
            if (!claim.live || this.attachedClaim !== claim) { this.restageRootStartup(startup.description); return; }
            // Resolve only at the reserved startup position, using accepted state.
            const action = startup.description.kind === 'action' ? startup.description.action : startup.description.decide(this.stateValue,this.dependencies);
            if (this.destroyed || this.runtimeInstance.isDisposed) return;
            if (!claim.live || this.attachedClaim !== claim) {
                // Impure decision callbacks may retire the claim. Never retain an
                // action computed without effective activation authority.
                this.restageRootStartup(startup.description);
                return;
            }
            if (action !== undefined) {
                const envelope: TurnEnvelope<Action> = {action,source:'lifecycle'};
                this.terminalObservers.set(envelope,event => {
                    if (event.type === 'rejected') this.observeInitializationFailure(claim,event.error);
                });
                this.queue.unshift(envelope);
            }
            return;
        }
        const { pending, claim } = command;
        pending.scheduled = false;
        if (!pending.record.live) return;
        if (this.attachedClaim !== claim || !claim.live) {
            if (this.attachedClaim?.live) this.scheduleInitialization(pending, this.attachedClaim);
            return;
        }
        const origin = pending.effect.origin;
        if (origin !== undefined && !isOwnerLive(this.lifecycleValue, origin)) { pending.record.dispose(); return; }
        pending.settling = true;
        this.runtimeInstance.resourceScope.complete(pending.record);
        pending.settling = false;
        if (this.destroyed || this.runtimeInstance.isDisposed || (origin !== undefined && !isOwnerLive(this.lifecycleValue, origin))) {
            this.pendingInitialization.delete(pending);
            return;
        }
        if (!claim.live || this.attachedClaim !== claim) { this.restageInitialization(pending); return; }
        this.pendingInitialization.delete(pending);
        this.runtimeInstance.executeEffect(pending.effect, this.lifecycleValue);
    }
    private observeInitializationFailure(claim: InitializationClaim, error: unknown): void {
        if (this.attachedClaim !== claim || !claim.live || !claim.onFailure || this.failedInitializationClaims.has(claim)) return;
        this.failedInitializationClaims.add(claim);
        this.attachedClaim = undefined;
        const report = (observerError: unknown): void => {
            try { void Promise.resolve(this.onSubscriberErrorSink(observerError)).catch(() => {}); }
            catch { /* Failure observation cannot interrupt the existing drain. */ }
        };
        try { void Promise.resolve(claim.onFailure(error)).catch(report); }
        catch (observerError) { report(observerError); }
    }
    select<T>(selector: Selector<State, T>): T {
        return selector(this.stateValue);
    }
    subscribe(listener: (state: State) => void): () => void {
        this.subscribers.add(listener);
        try {
            listener(this.stateValue);
        }
        catch (error) {
            this.onSubscriberErrorSink(error);
        }
        return () => {
            this.subscribers.delete(listener);
        };
    }
    subscribeToActions(listener: (action: Action, state: State) => void): () => void {
        this.actionSubscribers.add(listener);
        return () => {
            this.actionSubscribers.delete(listener);
        };
    }
    /** Framework-internal; the store filters deliveries per owner for `observeChildActions`. */
    subscribeOwnerDeliveries(listener: (owner: OwnerToken, action: unknown) => void): () => void {
        this.deliverySubscribers.add(listener);
        return () => {
            this.deliverySubscribers.delete(listener);
        };
    }
    destroy(): void {
        if (this.destroyed)
            return;
        this.destroyed = true;
        for (const envelope of this.queue.splice(0)) {
            if (!('control' in envelope)) this.observeTurn({type:'dropped',envelope,reason:'destroyed'});
            else if (envelope.control === 'inspect') this.observeInspection(envelope,{type:'inspection-dropped',reason:'destroyed'});
        }
        this.attachedClaim = undefined;
        this.rootStartup = undefined;
        this.subscribers.clear();
        this.actionSubscribers.clear();
        this.deliverySubscribers.clear();
        this.runtimeInstance.dispose();
    }
    private observeTurn(event: TurnEvent<State, Action>): void {
        const observer = this.terminalObservers.get(event.envelope);
        this.terminalObservers.delete(event.envelope);
        const report = (error: unknown): void => {
            try { void Promise.resolve(this.onSubscriberErrorSink(error)).catch(() => {}); }
            catch { /* A diagnostic sink cannot change turn acceptance or cleanup. */ }
        };
        try { void Promise.resolve(observer?.(event)).catch(report); }
        catch (error) { report(error); }
        try { void Promise.resolve(this.onTurnSink?.(event)).catch(report); }
        catch (error) { report(error); }
    }
    private drain(): void {
        this.isDraining = true;
        const capturedErrors: unknown[] = [];
        try {
            while (this.queue.length > 0) {
                if (this.destroyed) {
                    this.queue.length = 0;
                    break;
                }
                const envelope = this.queue.shift()!;
                if ('control' in envelope && envelope.control === 'inspect') {
                    if (envelope.origin !== undefined && !isOwnerLive(this.lifecycleValue, envelope.origin)) {
                        this.runtimeInstance.reportDrop(envelope.origin, 'dequeue');
                        this.observeInspection(envelope,{type:'inspection-dropped',reason:'stale-owner'});
                        continue;
                    }
                    try {
                        const resolved = envelope.resolve();
                        if (this.destroyed || (envelope.origin !== undefined && !isOwnerLive(this.lifecycleValue, envelope.origin))) {
                            if (!this.destroyed && envelope.origin !== undefined) this.runtimeInstance.reportDrop(envelope.origin, 'dequeue');
                            this.observeInspection(envelope,{type:'inspection-dropped',reason:this.destroyed ? 'destroyed' : 'stale-owner'});
                            continue;
                        }
                        if (resolved === undefined) this.observeInspection(envelope,{type:'skipped',state:this.stateValue});
                        else {
                            const turn: TurnEnvelope<Action> = {action:resolved.action,origin:envelope.origin,source:'external'};
                            this.terminalObservers.set(turn,event=>this.observeInspection(envelope,event));
                            if (resolved.settled) this.settlementObservers.set(turn,resolved.settled);
                            if (resolved.failure === 'report') this.reportedFailures.add(turn);
                            // Preserve this reserved FIFO position ahead of later actions.
                            this.queue.unshift(turn);
                        }
                    } catch (error) {
                        this.observeInspection(envelope,{type:'inspection-rejected',error});
                        capturedErrors.push(error);
                    }
                    continue;
                }
                if ('control' in envelope) {
                    try { this.runInitialization(envelope); } catch (error) { this.observeInitializationFailure(envelope.claim,error); capturedErrors.push(error); }
                    continue;
                }
                // 1. Dequeues an action and revalidates origin token.
                if (envelope.origin !== undefined && !isOwnerLive(this.lifecycleValue, envelope.origin)) {
                    this.runtimeInstance.reportDrop(envelope.origin, 'dequeue');
                    this.observeTurn({type: 'dropped', envelope, reason: 'stale-owner'});
                    continue;
                }
                // 2. Runs pure reduction once.
                let newState: State;
                let effect: Effect<Action>;
                let replacements: readonly ReplaceIntent[] = [];
                let incoming: readonly CreatedOwnerEffect<Action>[] = [];
                let deliveries: readonly OwnerActionDelivery[] = [];
                try {
                    let reductions = 0;
                    let reductionFailed = false;
                    let reductionError: unknown;
                    const reduceOnce: Reducer<State, Action, Dependencies> = (...args) => {
                        if (++reductions !== 1)
                            throw new Error('Managed adapter must invoke the feature reducer exactly once');
                        try {
                            return this.reducer(...args);
                        }
                        catch (error) {
                            reductionFailed = true;
                            reductionError = error;
                            throw error;
                        }
                    };
                    const result = this.reductionAdapter
                        ? this.reductionAdapter({ state: this.stateValue, action: envelope.action, dependencies: this.dependencies, lifecycle: this.lifecycleValue, reducer: reduceOnce })
                        : reduceOnce(this.stateValue, envelope.action, this.dependencies);
                    if (reductionFailed)
                        throw reductionError;
                    if (reductions !== 1)
                        throw new Error('Managed adapter must invoke the feature reducer exactly once');
                    replacements = result.length > 2 ? result[2] ?? [] : [];
                    incoming = result.length > 3 ? result[3] ?? [] : [];
                    deliveries = result.length > 4 ? result[4] ?? [] : [];
                    newState = result[0];
                    effect = result[1];
                }
                catch (error) {
                    // Proposed reducer-throw policy: atomic failed turn.
                    this.rejectTurn(envelope, error, capturedErrors);
                    continue;
                }
                let reconciliation: Reconciliation | undefined;
                let staged: Effect<Action>[] = [];
                try {
                    if (this.slotDescriptor !== undefined) {
                        reconciliation = reconcile(this.lifecycleValue, this.stateValue, newState, this.slotDescriptor, replacements);
                    }
                    else if (replacements.length || incoming.length) {
                        throw new TypeError('Managed owner intents require a slot descriptor');
                    }
                    const incomingEffects = incoming.map(entry => {
                        const owner = reconciliation && ownerAt(reconciliation.lifecycle, entry.path);
                        if (!owner || !reconciliation?.created.includes(owner)) {
                            throw new TypeError('Created-owner work requires an owner allocated by this turn');
                        }
                        assertUnstamped(entry.effect);
                        return stampOrigin(entry.effect, owner);
                    });
                    if (this.initialization) staged = incomingEffects;
                    else if (incomingEffects.length) effect = { _tag: 'Batch', effects: [effect, ...incomingEffects] };
                }
                catch (error) {
                    this.rejectTurn(envelope, error, capturedErrors);
                    continue;
                }
                // Publish lifecycle only after every pure part of the turn has validated.
                if (reconciliation)
                    this.lifecycleValue = reconciliation.lifecycle;
                if (this.maxHistorySize > 0) {
                    this.actionHistory.push(envelope.action);
                    if (this.actionHistory.length > this.maxHistorySize) {
                        this.actionHistory.shift();
                    }
                }
                // 3. Commits state, invalidates removed owners, and cancels resources before notifications.
                const previousState = this.stateValue;
                this.stateValue = newState;
                const committedState = this.stateValue;
                // Fix the eligible observers at commit. Hooks and subscribers below may
                // attach a listener, but it starts with the next turn.
                const deliveryListeners = [...this.deliverySubscribers];
                try {
                    this.onStateCommittedSink?.(committedState);
                }
                catch (error) {
                    capturedErrors.push(error);
                }
                if (reconciliation !== undefined) {
                    for (const token of reconciliation.invalidated) {
                        this.runtimeInstance.cancelOwner(token);
                    }
                }
                for (const description of staged) this.stageInitialization(description);
                this.observeTurn({type: 'committed', envelope, state: committedState});
                // 4. Notifies state subscribers of changed state, then action subscribers.
                if (!Object.is(previousState, committedState)) {
                    for (const listener of [...this.subscribers]) {
                        if (this.destroyed)
                            break;
                        try {
                            listener(committedState);
                        }
                        catch (error) {
                            this.onSubscriberErrorSink(error);
                        }
                    }
                }
                for (const listener of [...this.actionSubscribers]) {
                    if (this.destroyed)
                        break;
                    try {
                        listener(envelope.action, committedState);
                    }
                    catch (error) {
                        this.onSubscriberErrorSink(error);
                    }
                }
                // Each reduced child action goes to the exact owner that reduced it, after
                // commit. An owner retired by this turn has already had its subscription
                // records cancelled above, so it receives nothing.
                for (const delivery of deliveries) {
                    for (const listener of deliveryListeners) {
                        if (this.destroyed)
                            break;
                        try {
                            listener(delivery.owner, delivery.action);
                        }
                        catch (error) {
                            this.onSubscriberErrorSink(error);
                        }
                    }
                }
                const settled = this.settlementObservers.get(envelope);
                if (settled) {
                    this.settlementObservers.delete(envelope);
                    try { settled(); } catch (error) { this.onSubscriberErrorSink(error); }
                }
                if (this.destroyed) {
                    this.queue.length = 0;
                    break;
                }
                // Execute effects in declared batch order after qualification.
                if (effect && effect._tag !== 'None') {
                    try {
                        this.runtimeInstance.executeEffect(effect, this.lifecycleValue);
                    }
                    catch (error) {
                        capturedErrors.push(error);
                    }
                }
            }
        }
        finally {
            this.isDraining = false;
        }
        if (capturedErrors.length === 1) {
            throw capturedErrors[0];
        }
        else if (capturedErrors.length > 1) {
            throw new AggregateError(capturedErrors, 'Multiple errors occurred during turn drain');
        }
    }
}
