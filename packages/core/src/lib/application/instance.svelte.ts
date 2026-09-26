import type { RendererOwner } from './renderer/owner.js';
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
interface ApplicationInternal {
    readonly owner: RendererOwner;
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
