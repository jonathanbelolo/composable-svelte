import type { TurnEvent, InspectionEvent } from './turn-queue.js';
/** Internal, per-root authority. No component receives the root's lifecycle controls. */
import type { InitializationClaim } from './turn-queue.js';
import type { Store } from '../types.js';
import type { CleanupFunction, ResourceRecord, ResourceRecordOptions } from './resources.js';
import type { Lifecycle, OwnerToken } from './identity.js';
import type { ExecutionScheduler } from './scheduler.js';
interface ConfigurationIdentity {
    readonly _reduce?: unknown;
    readonly slots?: unknown;
}
export interface Access<Action> {
    readonly execution: ConfigurationIdentity;
    readonly scheduler: ExecutionScheduler;
    isLive(): boolean;
    activateInitialization(claim: InitializationClaim): void;
    releaseInitialization(claim: InitializationClaim): void;
    registerResource(options: ResourceRecordOptions): ResourceRecord;
    lifecycle(): Lifecycle;
    subscribe(origin: OwnerToken, listener: () => void): () => void;
    /** Child-domain actions reduced by exactly `origin`, after commit. Unbuffered; silent on retirement. */
    subscribeActions(origin: OwnerToken, listener: (action: unknown) => void): () => void;
    enqueue(action: Action, origin: OwnerToken): void;
    enqueueInspection(resolve: () => {readonly action: Action} | undefined, origin: OwnerToken | undefined, observer: (event: InspectionEvent<unknown, Action>) => void): void;
    enqueueObserved(action: Action, origin: OwnerToken | undefined, observer: (event: TurnEvent<unknown, Action>) => void): void;
}
const roots = new WeakMap<object, Access<unknown>>();
export function registerManagedRoot<S, A>(store: Store<S, A>, access: Access<A>): void {
    roots.set(store, access as Access<unknown>);
}
export function managedRootAccess<S, A>(store: Store<S, A>, execution: ConfigurationIdentity): Access<A> {
    const access = roots.get(store);
    if (!access)
        throw new TypeError('A managed slot requires a managed root store');
    if (access.execution._reduce !== execution._reduce || access.execution.slots !== execution.slots)
        throw new TypeError('Slot composition does not belong to this root store');
    return access as Access<A>;
}


/** Captured once by composition. Renderer code cannot resolve a replacement occupant. */
export interface CapturedView {
    readonly root: object;
    matchesSlot(slot: object): boolean;
    readonly origin: OwnerToken;
    isLive(): boolean;
    registerResource(options: Omit<ResourceRecordOptions, 'ownerToken'>): ResourceRecord;
    observeCleanup(cleanup: CleanupFunction): void;
    /** Backs the public `observeChildActions`; a no-op once the owner has retired. */
    observeActions(listener: (action: unknown) => void): () => void;
}
const views = new WeakMap<object, CapturedView>();
export function registerCapturedView(view: object, capture: CapturedView): void {
    views.set(view, capture);
}
/** Registry membership: true for retired views too. Liveness is `CapturedView.isLive`. */
export function isCapturedView(value: object): boolean {
    return views.has(value);
}
export function capturedView(view: object): CapturedView {
    const capture = views.get(view);
    if (!capture) throw new TypeError('Expected a managed child view');
    return capture;
}

/** Narrow public read/dispatch protocol; ownership stays in private metadata. */
export interface ManagedProjection<S, A> {
    readonly state: S;
    dispatch(action: A): void;
    select<T>(selector: (state: S) => T): T;
    subscribe(listener: (state: S) => void): () => void;
}
import type { SlotHandle, PresentationSlotHandle, ChildView, PresentationView } from '../navigation/managed-integration.js';
interface ProjectionBinding<S, A> {
    matchesComposition(execution: ConfigurationIdentity): boolean;
    isLive(): boolean;
    bind<C, CA>(slot: SlotHandle<S, A, C, CA>): ChildView<C, CA> | undefined;
}
// Aliases carry only a binding capability to the existing root. They are never
// registered as additional roots and allocate no execution/lifetime authority.
const projections = new WeakMap<object, ProjectionBinding<never, never>>();
export function registerManagedProjection<S, A>(projection: ManagedProjection<S, A>, binding: ProjectionBinding<S, A>): void {
    projections.set(projection, binding as unknown as ProjectionBinding<never, never>);
}
export function bindManagedProjection<S, A, C, CA>(projection: ManagedProjection<S, A>, slot: PresentationSlotHandle<S, A, C, CA>): PresentationView<C, CA> | undefined;
export function bindManagedProjection<S, A, C, CA>(projection: ManagedProjection<S, A>, slot: SlotHandle<S, A, C, CA>): ChildView<C, CA> | undefined;
export function bindManagedProjection<S, A, C, CA>(projection: ManagedProjection<S, A>, slot: SlotHandle<S, A, C, CA>): ChildView<C, CA> | undefined {
    const binding = projections.get(projection) as ProjectionBinding<S, A> | undefined;
    if (!binding) throw new TypeError('Typed scoping requires an application with a managed composition');
    return binding.bind(slot);
}

export function isManagedProjection(value: object): boolean { return projections.has(value); }

export function assertManagedProjectionComposition(projection: object, execution: ConfigurationIdentity): void {
    const binding=projections.get(projection);
    if(!binding || !binding.matchesComposition(execution)) throw new TypeError('View definition does not belong to this application composition');
}

export function managedProjectionIsLive(projection: object): boolean { return projections.get(projection)?.isLive() ?? false; }
