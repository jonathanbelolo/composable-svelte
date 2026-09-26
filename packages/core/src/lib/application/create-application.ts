import { applicationRouteAttachment, normalizeApplicationURL } from './routing.js';
import { registerManagedProjection, managedRootAccess } from '../execution/store-access.js';
import { onDestroy, untrack } from 'svelte';
import { createStore } from '../store.svelte.js';
import type { Store, StoreExecutionConfig } from '../types.js';
import { ManagedComposition } from '../navigation/managed-integration.js';
import { rendererOwner } from './renderer/owner.js';
import { getDefinitionInternal, type ApplicationDefinition } from './definition.js';
import { registerApplicationInternal, type ApplicationInstance, type ApplicationStore } from './instance.svelte.js';
export interface ApplicationOptions<S, D, I, Routed extends boolean = false> {
    readonly dependencies: D;
    readonly initial: ({
        readonly input: I;
        readonly state?: never;
    } | {
        readonly state: S;
        readonly input?: never;
    }) & (Routed extends true ? {readonly url: string} : {readonly url?: never});
}
/** Internal constructor, called only by the declarative ApplicationRoot boundary.
 * The boundary supplies synchronous destruction; onDestroy remains the SSR and
 * mounted-lifecycle fallback. Inputs and dependencies are captured once.
 */
export function createApplication<S, A, D, I, Routed extends boolean = false>(definition: ApplicationDefinition<S, A, D, I, Routed>, options: ApplicationOptions<NoInfer<S>, NoInfer<D>, NoInfer<I>, NoInfer<Routed>>): ApplicationInstance<S, A> {
    return untrack(() => {
        const descriptor = getDefinitionInternal(definition);
        if (!options || typeof options !== 'object' || !('dependencies' in options))
            throw new TypeError('Application dependencies and initial data are required');
        const initial = options.initial;
        const dependencies = options.dependencies;
        if (!initial || typeof initial !== 'object' || ('input' in initial) === ('state' in initial))
            throw new TypeError('Provide exactly one initial input or state');
        let store: Store<S, A> | undefined;
        let destroyed = false;
        const destroy = () => { if (destroyed)
            return; destroyed = true; store?.destroy(); };
        // Register before invoking application factories, so invalid call sites cannot
        // start construction and construction failures share the same idempotent cleanup.
        onDestroy(destroy);
        try {
            const initialURL = descriptor.routing ? normalizeApplicationURL(initial.url!, true) : undefined;
            if (!descriptor.routing && 'url' in initial) throw new TypeError('Initial URL requires a routed application definition');
            const state = 'state' in initial ? initial.state as S : descriptor.initialState(initial.input as I);
            const feature = descriptor.feature;
            const execution: StoreExecutionConfig<S, A, D> = {
                ...(feature instanceof ManagedComposition ? feature.execution : {}), mode: 'managed',
                _initialization: descriptor.startup
                    ? { mode: 'attached', startupDecision: descriptor.startup }
                    : { mode: 'attached' }
            };
            const created = createStore({ initialState: state, reducer: feature instanceof ManagedComposition ? feature.reducer : feature, dependencies, execution });
            store = created;
            const renderer = rendererOwner(created, execution, {
                ...(descriptor.routing ? {route: applicationRouteAttachment(created, execution, descriptor.routing, initialURL!)} : {}),
                onFailure: destroy
            });
            let hasHosted = false;
            const owner = {
                claim() {
                    const claim = renderer.claim();
                    hasHosted = true;
                    return claim;
                }
            };
            const projection: ApplicationStore<S, A> = Object.freeze({
                get state() { return created.state; },
                dispatch: (action: A) => {
                    if (!hasHosted) throw new Error('Application dispatch requires its first ApplicationHost claim; use initialState or startup for initialization');
                    created.dispatch(action);
                },
                select: <T>(selector: (state: S) => T) => created.select(selector),
                subscribe: (listener: (state: S) => void) => created.subscribe(listener)
            });
            if (feature instanceof ManagedComposition) {
                registerManagedProjection(projection, {
                    isLive: () => managedRootAccess(created, feature.execution).isLive(),
                    matchesComposition: execution => feature.execution._reduce === execution._reduce && feature.execution.slots === execution.slots,
                    bind(slot) {
                        if (!hasHosted) throw new Error('Application scoping requires its first ApplicationHost claim; scope in a hosted descendant');
                        return feature.bind(created, slot);
                    }
                });
            }
            return registerApplicationInternal(projection, { owner, destroy });
        }
        catch (error) {
            destroy();
            throw error;
        }
    });
}
