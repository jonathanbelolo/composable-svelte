import type { RendererOwner } from './renderer/owner.js';
import type { StagedRouteCoordinator } from '../routing/staged/types.js';
import type { RouteScrollSeam } from '../routing/scroll-restoration.js';
const ownerBrand: unique symbol = Symbol('ApplicationOwner');
/** Opaque component owner; lifecycle methods intentionally remain private. */
export interface ApplicationOwner {
    readonly [ownerBrand]: true;
}
/** Reactive feature projection. Internal lifecycle/history and destruction are not exposed. */
export type ApplicationStore<S, A> = import('../execution/store-access.js').ManagedProjection<S, A>;
export interface ApplicationInstance<S, A> extends ApplicationOwner {
    readonly store: ApplicationStore<S, A>;
}
/** Internal staged routing assembly: the coordinator and its declared route slot. */
export interface ApplicationStagedRoute {
    /** Intent-erased; `useStagedRoute` restores the exact definition's intent type. */
    readonly coordinator: StagedRouteCoordinator<never>;
    readonly routeSlot: object;
    /** The managed root store identity that captured views belong to. */
    readonly root: object;
    /** Root committed state, for route-slot case resolution. */
    readonly state: () => unknown;
    /** Owner token of the committed route instance, if any. */
    readonly routeOwner: () => object | undefined;
    /** Committed root state notifications. */
    readonly subscribe: (listener: () => void) => () => void;
}
interface ApplicationInternal {
    readonly owner: RendererOwner;
    readonly staged?: ApplicationStagedRoute | undefined;
    /** Browser scroll seam for routed definitions declaring scroll ownership (see scroll-interfaces.md). */
    readonly scroll?: RouteScrollSeam | undefined;
    /** Visual engine configuration declared by the definition (`visual`), if any. */
    readonly visual?: import('./renderer/representation/types.js').VisualConfiguration | undefined;
    destroy(): void;
}
const instances = new WeakMap<object, ApplicationInternal>();
export function registerApplicationInternal<S, A>(store: ApplicationStore<S, A>, internal: ApplicationInternal): ApplicationInstance<S, A> {
    const app = Object.freeze({ [ownerBrand]: true as const, store });
    instances.set(app, internal);
    return app;
}
export function getApplicationInternal(app: ApplicationOwner): ApplicationInternal {
    const internal = instances.get(app);
    if (!internal)
        throw new TypeError('Expected an instance created by useApplication');
    return internal;
}
