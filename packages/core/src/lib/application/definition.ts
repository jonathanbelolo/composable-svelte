import { captureApplicationRouting, type ApplicationRouting } from './routing.js';
import type { Reducer } from '../types.js';
import { ManagedComposition } from '../navigation/managed-integration.js';
import type { VisualConfiguration } from './renderer/representation/types.js';
const definitionBrand: unique symbol = Symbol('ApplicationDefinition');
interface DefinitionBase<S, A, D, I> {
    /** Pure factory; called once for each component-owned instance. */
    readonly initialState: (input: I) => S;
    /** Pure decision evaluated once after attachment; its action enters the managed queue. Loaded data returns undefined. */
    readonly startup?: NoInfer<(state: S, dependencies: D) => A | undefined> | undefined;
    /**
     * Optional visual engine configuration from `fluidMotion()` (`@composable-svelte/core/application/motion`):
     * representation providers, default preparation budget, diagnostics. Plans carry a default engine, so
     * ordinary motion needs no configuration; motion-free applications never reach an engine.
     */
    readonly visual?: VisualConfiguration | undefined;
}
export interface ApplicationDefinitionOptions<S, A, D, I> extends DefinitionBase<S, A, D, I> {
    readonly routing?: undefined;
}
export interface RoutedApplicationDefinitionOptions<S, A, D, I, Intent = never> extends DefinitionBase<S, A, D, I> {
    readonly routing: ApplicationRouting<S, A, Intent>;
}
/** `Intent` appears only in parameter position: a staged definition remains usable where no intent is required. */
export interface ApplicationDefinition<S, A, D, I, Routed extends boolean = false, Intent = never> {
    readonly [definitionBrand]: (state: S, action: A, dependencies: D, input: I, routed: Routed, intent: Intent) => [
        S,
        A,
        D,
        I,
        Routed
    ];
}
interface DefinitionInternal<S, A, D, I> extends DefinitionBase<S, A, D, I> {
    readonly feature: Reducer<S, A, D> | ManagedComposition<S, A, D>;
    /** Intent is erased to `never`: staging decisions are contravariant in their intent. */
    readonly routing?: ApplicationRouting<S, A, never> | undefined;
}
const definitions = new WeakMap<object, unknown>();
/** Inert definition. No factory, reducer, startup decision or browser work runs here. */
export function defineApplication<S, const A, D, I, Intent = never>(feature: Reducer<S, A, D> | ManagedComposition<S, A, D>, options: RoutedApplicationDefinitionOptions<S, NoInfer<A>, D, I, Intent>): ApplicationDefinition<S, A, D, I, true, Intent>;
export function defineApplication<S, const A, D, I>(feature: Reducer<S, A, D> | ManagedComposition<S, A, D>, options: ApplicationDefinitionOptions<S, NoInfer<A>, D, I>): ApplicationDefinition<S, A, D, I, false>;
export function defineApplication<S, A, D, I>(feature: Reducer<S, A, D> | ManagedComposition<S, A, D>, options: DefinitionBase<S, A, D, I> & {readonly routing?: ApplicationRouting<S, A, never> | undefined}): unknown {
    if (typeof feature !== 'function' && !(feature instanceof ManagedComposition))
        throw new TypeError('Expected a reducer or managed composition');
    if (!options || typeof options.initialState !== 'function')
        throw new TypeError('Expected an initialState factory');
    if (options.startup !== undefined && typeof options.startup !== 'function')
        throw new TypeError('Expected a startup decision');
    if (options.visual !== undefined && (typeof options.visual !== 'object' || (options.visual.engine as { kind?: unknown } | undefined)?.kind !== 'composable-visual-engine'))
        throw new TypeError('Expected a visual configuration created by fluidMotion()');
    const routing = options.routing === undefined ? undefined : captureApplicationRouting(options.routing);
    const definition = Object.freeze({ [definitionBrand]: (s: S, a: A, d: D, i: I, routed: boolean, _intent: unknown): [S,A,D,I,boolean] => [s,a,d,i,routed] });
    definitions.set(definition, Object.freeze({ feature, initialState: options.initialState, startup: options.startup, routing, visual: options.visual }));
    return definition;
}
/** Private lookup: runtime authenticity is checked independently of TypeScript. */
export function getDefinitionInternal<S, A, D, I, Routed extends boolean, Intent = never>(definition: ApplicationDefinition<S, A, D, I, Routed, Intent>): DefinitionInternal<S, A, D, I> {
    const value = definitions.get(definition);
    if (!value)
        throw new TypeError('Expected a definition created by defineApplication');
    return value as DefinitionInternal<S, A, D, I>;
}
