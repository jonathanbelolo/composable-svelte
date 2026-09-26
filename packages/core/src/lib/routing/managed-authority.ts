/** Framework-only routing authority. Root and captured child lifetimes stay distinct. */
import type { Store, StoreExecutionConfig } from '../types.js';
import type { ManagedComposition, SlotHandle } from '../navigation/managed-integration.js';
import { capturedView, managedRootAccess } from '../execution/store-access.js';
import type { InspectionEvent } from '../execution/turn-queue.js';
import type { ResourceRecord } from '../execution/resources.js';
export interface RouteSnapshot<S> {
    readonly state: S;
}
export interface RouteAuthority<S, A> {
    readonly kind: 'root' | 'child';
    read(): RouteSnapshot<S> | undefined;
    isLive(): boolean;
    register(): ResourceRecord;
    subscribe(listener: (snapshot: RouteSnapshot<S> | undefined) => void): () => void;
    enqueue(action: A, observer: (event: InspectionEvent<unknown, unknown>) => void): void;
    inspect(resolve: () => {
        readonly action: A;
    } | undefined, observer: (event: InspectionEvent<unknown, unknown>) => void): void;
}
export function childRouteAuthority<S, A, D, C, CA>(store: Store<S, A>, composition: ManagedComposition<S, A, D>, slot: SlotHandle<S, A, C, CA>): RouteAuthority<C, CA> | undefined {
    const view = composition.bind(store, slot);
    if (!view)
        return undefined;
    const capture = capturedView(view), access = managedRootAccess(store, composition.execution);
    return {
        kind: 'child',
        read: () => { const state = view.state; return capture.isLive() && state !== undefined ? { state } : undefined; },
        isLive: () => capture.isLive(),
        register: () => capture.registerResource({ kind: 'subscription', description: 'Managed route connection' }),
        subscribe: listener => view.subscribe(state => listener(state === undefined ? undefined : { state })),
        enqueue: (action, observer) => access.enqueueObserved(slot.wrap(action), capture.origin, observer),
        inspect: (resolve, observer) => access.enqueueInspection(() => { const result = resolve(); return result === undefined ? undefined : { action: slot.wrap(result.action) }; }, capture.origin, observer)
    };
}
export function rootRouteAuthority<S, A, D>(store: Store<S, A>, execution: StoreExecutionConfig<S, A, D>): RouteAuthority<S, A> {
    const access = managedRootAccess(store, execution);
    return {
        kind: 'root',
        read: () => access.isLive() && !store._runtime?.isServer ? { state: store.state } : undefined,
        isLive: () => access.isLive(),
        register: () => access.registerResource({ kind: 'subscription', description: 'Managed root route connection' }),
        subscribe: listener => store.subscribe(state => listener(access.isLive() ? { state } : undefined)),
        enqueue: (action, observer) => access.enqueueObserved(action, undefined, observer),
        inspect: (resolve, observer) => access.enqueueInspection(resolve, undefined, observer)
    };
}
