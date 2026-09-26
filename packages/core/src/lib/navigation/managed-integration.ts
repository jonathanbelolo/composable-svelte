/** Typed managed composition: child ownership and effects share the root executor. */
import { Effect, liftEffect, type LiftPolicy } from '../effect.js';
import type { Reducer, Effect as EffectType, Store, StoreExecutionConfig, CreatedOwnerEffect, OwnerActionDelivery } from '../types.js';
import { ownerAt, stampOrigin, isOwnerLive, isOwnerPathWithin, type OwnerPath, type Lifecycle, type ReplaceIntent } from '../execution/identity.js';
import { managedRootAccess, registerCapturedView } from '../execution/store-access.js';
import type { PresentationAction, DestinationState, DestinationAction } from './types.js';
import type { Destination } from './destination.js';
import { destinationCases, isDestinationReducer, type DestinationCases } from './destination-metadata.js';
import type { IdentifiedItem } from '../composition/for-each.js';
const slotLineage: unique symbol = Symbol('managed slot lineage');
const slotTypes: unique symbol = Symbol('managed slot types');
const presentationSlotBrand: unique symbol = Symbol('managed presentation slot');
const presentationViewBrand: unique symbol = Symbol('managed presentation view');
const managedSlotHandles = new WeakSet<object>();
const slotDismissals = new WeakMap<object, () => unknown>();
const presentationViews = new WeakSet<object>();
function witness<S, A, C, CA>(state: S, action: A, child: C, childAction: CA): [
    S,
    A,
    C,
    CA
] {
    return [state, action, child, childAction];
}
export interface SlotHandle<S, A, C, CA> {
    /** Invariant linkage prevents a renderer accepting an unrelated parent/action schema. */
    readonly [slotTypes]: (state: S, action: A, child: C, childAction: CA) => [
        S,
        A,
        C,
        CA
    ];
    readonly [slotLineage]: readonly symbol[];
    readonly field: string;
    read(state: S): C | undefined;
    wrap(action: CA): A;
    readonly path: OwnerPath;
}
/** A framework-minted slot whose exact captured owner may dismiss its presentation. */
export interface PresentationSlotHandle<S, A, C, CA> extends SlotHandle<S, A, C, CA> {
    readonly [presentationSlotBrand]: true;
}
export interface OptionalSlot<S, A, C, CA, K extends string = string> extends PresentationSlotHandle<S, A, C, CA> {
    readonly field: K;
    write(state: S, child: C | null): S;
    unwrap(action: A): PresentationAction<CA> | undefined;
}
type PresentedChild<W> = W extends {
    type: 'presented';
    action: infer C;
} ? C : never;
type RoutedChild<C> = C extends {
    action: infer W;
} ? PresentedChild<W> : never;
type Presented<A, K> = RoutedChild<Extract<A, {
    type: K;
}>>;
type SameDomain<Expected, Actual> = [
    Expected
] extends [
    Actual
] ? [
    Actual
] extends [
    Expected
] ? true : false : false;
type PresentationKey<S, A> = {
    [K in keyof S & string]: null extends S[K] ? [
        Presented<A, K>
    ] extends [
        never
    ] ? never : SameDomain<{
        type: K;
        action: PresentationAction<Presented<A, K>>;
    }, Extract<A, {
        type: K;
    }>> extends true ? K : never : never;
}[keyof S & string];
type DestinationShapedKey<S, A> = {
    [K in PresentationKey<S, A>]: [NonNullable<S[K]>] extends [{ type: string; state: unknown }]
        ? [Presented<A, K>] extends [{ type: string; action: unknown }] ? K : never
        : never;
}[PresentationKey<S, A>];
type OptionalKey<S, A> = Exclude<PresentationKey<S, A>, DestinationShapedKey<S, A>>;
export interface OptionalSlotFactory<S, A> {
    <K extends OptionalKey<S, A>>(field: K): OptionalSlot<S, A, NonNullable<S[K]>, Presented<A, K>, K>;
    <K extends DestinationShapedKey<S, A>>(field: K, options: { readonly destinationShape: 'ordinary' }): OptionalSlot<S, A, NonNullable<S[K]>, Presented<A, K>, K>;
}
/** Uses the existing declared field / PresentationAction convention, checked at compile time. */
export function optionalSlot<S, A>(): OptionalSlotFactory<S, A> {
    return function<K extends PresentationKey<S, A>>(field: K, options?: { readonly destinationShape: 'ordinary' }): OptionalSlot<S, A, NonNullable<S[K]>, Presented<A, K>, K> {
        if (arguments.length > 2 || (arguments.length > 1 && (options === null || typeof options !== 'object'
            || Reflect.ownKeys(options).length !== 1 || !Object.hasOwn(options, 'destinationShape')
            || options.destinationShape !== 'ordinary')))
            throw new TypeError("optionalSlot options must be exactly { destinationShape: 'ordinary' }");
        type C = NonNullable<S[K]>;
        type CA = Presented<A, K>;
        const handle = Object.freeze({
            [presentationSlotBrand]: true as const,
            [slotLineage]: Object.freeze([Symbol(field)]), [slotTypes]: witness<S, A, C, CA>, field, path: Object.freeze([Object.freeze({
                    slot: field
                })]),
            read: (state: S) => (state[field] ?? undefined) as C | undefined,
            write: (state: S, child: C | null) => ({
                ...state, [field]: child
            }),
            wrap: (action: CA) => ({
                type: field, action: {
                    type: 'presented', action
                }
            } as A),
            unwrap: (action: A) => (action as {
                type?: unknown;
            }).type === field ? (action as {
                action: PresentationAction<CA>;
            }).action : undefined
        }) as OptionalSlot<S, A, C, CA, K>;
        managedSlotHandles.add(handle);
        slotDismissals.set(handle, () => ({ type: field, action: { type: 'dismiss' } } as A));
        return handle;
    } as OptionalSlotFactory<S, A>;
}
type DestinationReducers = Record<string, Reducer<any, any, any>>;
type CaseState<R extends DestinationReducers, P extends keyof R> = R[P] extends Reducer<infer C, any, any> ? C : never;
type CaseAction<R extends DestinationReducers, P extends keyof R> = R[P] extends Reducer<any, infer CA, any> ? CA : never;
type DestinationKey<S, A> = { [K in PresentationKey<S, A>]: NonNullable<S[K]> extends { type: string; state: unknown } ? K : never }[PresentationKey<S, A>];
type DestinationFits<S, A, K extends keyof S, R extends DestinationReducers> = SameDomain<NonNullable<S[K]>, DestinationState<R>> extends true
    ? SameDomain<Presented<A, K>, DestinationAction<R>> extends true ? unknown : never : never;
/** Case-aware destination token, exported from the application entry point. */
export interface DestinationSlot<S, A, R extends DestinationReducers, K extends string = string> {
    readonly [slotLineage]: readonly symbol[];
    readonly field: K;
    case<P extends keyof R & string>(key: P): PresentationSlotHandle<S, A, CaseState<R, P>, CaseAction<R, P>>;
}
interface DestinationSlotInternal {
    readonly metadata: DestinationCases;
    readonly handles: ReadonlyMap<string, PresentationSlotHandle<any, any, any, any>>;
}
const destinationSlots = new WeakMap<object, DestinationSlotInternal>();
export interface DestinationSlotFactory<S, A> {
    <K extends DestinationKey<S, A>, R extends DestinationReducers>(field: K, destination: Destination<R> & DestinationFits<S, A, K, R>): DestinationSlot<S, A, R, K>;
}
export function destinationSlot<S, A>(): DestinationSlotFactory<S, A> {
    return <K extends DestinationKey<S, A>, R extends DestinationReducers>(field: K, destination: Destination<R> & DestinationFits<S, A, K, R>): DestinationSlot<S, A, R, K> => {
        const metadata = destinationCases(destination);
        const lineage = Object.freeze([Symbol(field)]);
        const handles = new Map<string, PresentationSlotHandle<S, A, any, any>>();
        for (const key of metadata.keys) {
            const handle = Object.freeze({
                [presentationSlotBrand]: true as const,
                [slotLineage]: lineage, [slotTypes]: witness<S, A, any, any>, field,
                path: Object.freeze([Object.freeze({ slot: field }), Object.freeze({ key })]),
                read: (state: S) => {
                    const value = state[field] as { type: string; state: unknown } | null | undefined;
                    return value?.type === key ? value.state : undefined;
                },
                wrap: (action: unknown) => ({ type: field, action: { type: 'presented', action: { type: key, action } } } as A)
            }) as PresentationSlotHandle<S, A, any, any>;
            managedSlotHandles.add(handle);
            slotDismissals.set(handle, () => ({ type: field, action: { type: 'dismiss' } } as A));
            handles.set(key, handle);
        }
        const token: DestinationSlot<S, A, R, K> = Object.freeze({
            [slotLineage]: lineage, field,
            case<P extends keyof R & string>(key: P): PresentationSlotHandle<S, A, CaseState<R, P>, CaseAction<R, P>> {
                const handle = handles.get(key);
                if (!handle) throw new TypeError(`'${key}' is not a case of destination slot '${field}'`);
                return handle;
            }
        });
        destinationSlots.set(token, { metadata, handles });
        return token;
    };
}
type Item<S, K extends keyof S> = S[K] extends readonly IdentifiedItem<infer ID, infer C>[] ? {
    id: ID;
    state: C;
} : never;
type ItemAction<A, K> = Extract<A, {
    type: K;
}> extends {
    action: infer CA;
} ? CA : never;
type CollectionKey<S, A> = {
    [K in keyof S & string]: S[K] extends IdentifiedItem<infer ID, infer _C>[] ? [
        ID
    ] extends [
        string | number
    ] ? [
        Extract<A, {
            type: K;
        }>
    ] extends [
        never
    ] ? never : SameDomain<{
        type: K;
        id: ID;
        action: ItemAction<A, K>;
    }, Extract<A, {
        type: K;
    }>> extends true ? K : never : never : never;
}[keyof S & string];
export interface KeyedSlot<S, A, C, CA, ID extends string | number, K extends string = string> {
    readonly [slotLineage]: readonly symbol[];
    readonly field: K;
    items(state: S): readonly IdentifiedItem<ID, C>[];
    write(state: S, items: IdentifiedItem<ID, C>[]): S;
    unwrap(action: A): {
        id: ID;
        action: CA;
    } | undefined;
    at(id: ID): SlotHandle<S, A, C, CA>;
}
const keyedSlots = new WeakSet<object>();
export function keyedSlot<S, A>() {
    return <K extends CollectionKey<S, A>>(field: K): KeyedSlot<S, A, Item<S, K>['state'], ItemAction<A, K>, Extract<Item<S, K>['id'], string | number>, K> => {
        type C = Item<S, K>['state'];
        type CA = ItemAction<A, K>;
        type ID = Extract<Item<S, K>['id'], string | number>;
        const lineage = Object.freeze([Symbol(field)]);
        const items = (state: S) => state[field] as readonly IdentifiedItem<ID, C>[];
        const token = Object.freeze({
            [slotLineage]: lineage, field, items, write: (state: S, value: IdentifiedItem<ID, C>[]) => ({
                ...state, [field]: value
            }),
            unwrap: (action: A) => (action as {
                type?: unknown;
            }).type === field ? (action as {
                id: ID;
                action: CA;
            }) : undefined,
            at: (id: ID) => {
                const handle = Object.freeze({
                [slotLineage]: lineage, [slotTypes]: witness<S, A, C, CA>, field, path: Object.freeze([Object.freeze({
                        slot: field
                }), Object.freeze({
                        key: id
                    })]), read: (state: S) => items(state).find(item => Object.is(item.id, id))?.state, wrap: (action: CA) => ({
                    type: field, id, action
                } as A)
                }) as SlotHandle<S, A, C, CA>;
                managedSlotHandles.add(handle);
                return handle;
            }
        });
        keyedSlots.add(token);
        return token;
    };
}
export function nestedSlot<S, A, C, CA, N, NA>(parent: SlotHandle<S, A, C, CA>, child: PresentationSlotHandle<C, CA, N, NA>): PresentationSlotHandle<S, A, N, NA>;
export function nestedSlot<S, A, C, CA, N, NA>(parent: SlotHandle<S, A, C, CA>, child: SlotHandle<C, CA, N, NA>): SlotHandle<S, A, N, NA>;
export function nestedSlot<S, A, C, CA, N, NA>(parent: SlotHandle<S, A, C, CA>, child: SlotHandle<C, CA, N, NA>): SlotHandle<S, A, N, NA> {
    if (!managedSlotHandles.has(parent) || !managedSlotHandles.has(child))
        throw new TypeError('Expected genuine managed slot handles');
    const dismissal = slotDismissals.get(child);
    const handle = Object.freeze({
        ...(dismissal ? { [presentationSlotBrand]: true as const } : {}),
        [slotLineage]: Object.freeze([...parent[slotLineage], ...child[slotLineage]]), [slotTypes]: witness<S, A, N, NA>, field: child.field, path: Object.freeze([...parent.path, ...child.path]), read: (state: S) => {
            const value = parent.read(state);
            return value === undefined ? undefined : child.read(value);
        }, wrap: (action: NA) => parent.wrap(child.wrap(action))
    }) as SlotHandle<S, A, N, NA>;
    managedSlotHandles.add(handle);
    if (dismissal) slotDismissals.set(handle, () => parent.wrap(dismissal() as CA));
    return handle;
}
export interface ChildView<C, A> {
    readonly state: C | undefined;
    dispatch(action: A): void;
    select<T>(selector: (state: C | undefined) => T): T;
    subscribe(listener: (state: C | undefined) => void): () => void;
}
/** A nominal managed view whose dismissal is bound to its captured presentation owner. */
export interface PresentationView<C, A> extends ChildView<C, A> {
    readonly [presentationViewBrand]: true;
    dismiss(): void;
}
/** Internal runtime membership gate for component adapters during the public transition. */
export function assertPresentationView<C, A>(value: unknown): asserts value is PresentationView<C, A> {
    if (typeof value !== 'object' || value === null || !presentationViews.has(value))
        throw new TypeError('Expected a managed presentation view');
}
interface Result<S, A> {
    state: S;
    effect: EffectType<A>;
    replacements: ReplaceIntent[];
}
interface Context {
    lifecycle: Lifecycle;
    prefix: OwnerPath;
    firstState?: boolean;
    /** Child actions reduced per owner; shared by every nested context of one root turn. */
    deliveries?: OwnerActionDelivery[];
}
interface Integration<S, A, D> {
    accepts(lineage: readonly symbol[]): boolean;
    paths(state: S, prefix: OwnerPath): OwnerPath[];
    reduce(state: S, action: A, deps: D, context: Context): Result<S, A>;
    replacements(before: S, after: S, action: A, prefix: OwnerPath): ReplaceIntent[];
    initial(state: S, deps: D, context: Context, replacements: readonly ReplaceIntent[]): CreatedOwnerEffect<A>[];
}
export interface ChildPolicy<S, A, C, CA, D> {
    /** Business event that deliberately replaces an existing same-case feature. */
    replaceOn?: ((action: A, before: S, after: S) => boolean) | undefined;
    /** Explicit initial work for a newly allocated feature. */
    onCreate?: ((state: C, deps: D) => EffectType<CA>) | undefined;
    /** Pure business startup decision; undefined means initial data already satisfies it. */
    startup?: ((state: C, deps: D) => CA | undefined) | undefined;
    /** Immediate removal by default; deferred keeps every dismissal as a request until an explicit child action completes it. */
    dismissal?: 'immediate' | 'deferred' | undefined;
}
export interface KeyedChildPolicy<A, C, CA, ID, D> {
    replaceOn?: ((action: A, id: ID, before: C, after: C) => boolean) | undefined;
    onCreate?: ((state: C, deps: D) => EffectType<CA>) | undefined;
    /** Pure business startup decision; undefined means initial data already satisfies it. */
    startup?: ((state: C, deps: D) => CA | undefined) | undefined;
}
function newlyCreated(context: Context, path: OwnerPath, replacements: readonly ReplaceIntent[]): boolean {
    return context.firstState === true || ownerAt(context.lifecycle, path) === undefined || replacements.some(intent => isOwnerPathWithin(path, intent.path));
}
function validateDismissal(dismissal: unknown): void {
    if (dismissal !== undefined && dismissal !== 'immediate' && dismissal !== 'deferred')
        throw new TypeError("Dismissal policy must be 'immediate' or 'deferred'");
}
/** Compile-time slot catalog. Runtime schema data is held privately below. */
export interface SlotSchema<S = unknown, A = unknown, Children extends SlotCatalog = SlotCatalog, Presentation extends boolean = boolean> {
    readonly state: S;
    readonly action: A;
    readonly children: Children;
    readonly presentation: Presentation;
}
export interface CaseSchema<S = unknown, A = unknown> { readonly state: S; readonly action: A; }
export interface DestinationSlotSchema<R extends DestinationReducers> extends SlotSchema<DestinationState<R>, DestinationAction<R>, {}, true> {
    readonly cases: { readonly [P in keyof R & string]: CaseSchema<CaseState<R, P>, CaseAction<R, P>> };
}
export interface SlotCatalog { readonly [field: string]: SlotSchema; }
const catalogTypes: unique symbol = Symbol('composition view catalog');
/** Internal schema metadata, not a store or lifecycle registry. */
export interface CompositionViewEntry {
    readonly field: string;
    readonly kind: 'optional' | 'keyed' | 'destination';
    readonly slot: OptionalSlot<any, any, any, any> | KeyedSlot<any, any, any, any, any> | DestinationSlot<any, any, any>;
    readonly cases?: readonly string[] | undefined;
    readonly child: ManagedComposition<any, any, any> | undefined;
}
const viewCatalogs = new WeakMap<object, readonly CompositionViewEntry[]>();
export function compositionViewEntries(composition: object): readonly CompositionViewEntry[] {
    const entries = viewCatalogs.get(composition);
    if (!entries) throw new TypeError('Composition has no qualified view catalog');
    return entries;
}
export class ManagedComposition<S, A, D, Catalog extends SlotCatalog = SlotCatalog> {
    declare readonly [catalogTypes]: Catalog;
    private readonly views = new WeakMap<object, WeakMap<object, WeakMap<object, ChildView<unknown, unknown>>>>();
    readonly execution: StoreExecutionConfig<S, A, D>;
    constructor(readonly reducer: Reducer<S, A, D>, private readonly children: readonly Integration<S, A, D>[], catalog?: readonly CompositionViewEntry[]) {
        if (catalog) viewCatalogs.set(this, Object.freeze([...catalog]));
        else if (children.length === 0) viewCatalogs.set(this, Object.freeze([]));
        this.execution = Object.freeze({
            mode: 'managed', _initial: (state, dependencies, lifecycle) => this.initial(state, dependencies, { lifecycle, prefix: [], firstState: true }, []), slots: {
                select: (state: S) => this.paths(state, [])
            }, _reduce: ({ state, action, dependencies, lifecycle, reducer }) => {
                const context: Context = {
                    lifecycle, prefix: [], deliveries: []
                };
                const result = this.reduce(state, action, dependencies, context, reducer);
                const finalPaths = this.paths(result.state, []);
                const contains = (path: OwnerPath) => finalPaths.some(selected => selected.length === path.length && isOwnerPathWithin(selected, path));
                // Composition-generated intents only: an exact path absent from the final
                // composed paths was superseded later in this same pure reduction. Invalid
                // direct replacement requests remain for the shared allocator to reject.
                const replacements = result.replacements.filter(intent => contains(intent.path));
                return [result.state, result.effect, replacements, this.initial(result.state, dependencies, context, replacements), context.deliveries ?? []];
            }
        } satisfies StoreExecutionConfig<S, A, D>);
    }
    accepts(lineage: readonly symbol[]): boolean {
        return this.children.some(child => child.accepts(lineage));
    }
    paths(state: S, prefix: OwnerPath): OwnerPath[] {
        return this.children.flatMap(child => child.paths(state, prefix));
    }
    reduce<Supplied extends D = D>(state: S, action: A, deps: Supplied, context: Context, core: Reducer<S, A, Supplied> = this.reducer): Result<S, A> {
        let next = state;
        const effects: EffectType<A>[] = [];
        const replacements: ReplaceIntent[] = [];
        for (const child of this.children) {
            const result = child.reduce(next, action, deps, context);
            next = result.state;
            effects.push(result.effect);
            replacements.push(...result.replacements);
        }
        const [final, parentEffect] = core(next, action, deps);
        effects.push(parentEffect);
        for (const child of this.children)
            replacements.push(...child.replacements(state, final, action, context.prefix));
        return {
            state: final, effect: Effect.batch(...effects), replacements
        };
    }
    initial(state: S, deps: D, context: Context, replacements: readonly ReplaceIntent[]): CreatedOwnerEffect<A>[] {
        return this.children.flatMap(child => child.initial(state, deps, context, replacements));
    }
    bind<C, CA>(store: Store<S, A>, slot: PresentationSlotHandle<S, A, C, CA>): PresentationView<C, CA> | undefined;
    bind<C, CA>(store: Store<S, A>, slot: SlotHandle<S, A, C, CA>): ChildView<C, CA> | undefined;
    bind<C, CA>(store: Store<S, A>, slot: SlotHandle<S, A, C, CA>): ChildView<C, CA> | undefined {
        if (destinationSlots.has(slot)) throw new TypeError('Destination slots bind through a case handle');
        if (!managedSlotHandles.has(slot)) throw new TypeError('Expected a genuine managed slot handle');
        const access = managedRootAccess(store, this.execution);
        if (!access.isLive())
            throw new Error('Cannot bind a destroyed root store');
        if (!this.accepts(slot[slotLineage] ?? []))
            throw new TypeError('Slot token is not registered in this composition');
        const owner = ownerAt(access.lifecycle(), slot.path);
        if (!owner)
            return undefined;
        let owners = this.views.get(store);
        if (!owners) { owners = new WeakMap(); this.views.set(store, owners); }
        let slots = owners.get(owner);
        if (!slots) { slots = new WeakMap(); owners.set(owner, slots); }
        const existing = slots.get(slot);
        if (existing) return existing as ChildView<C, CA>;
        const read = () => access.isLive() && isOwnerLive(access.lifecycle(), owner) ? slot.read(store.state) : undefined;
        const dismissal = slotDismissals.get(slot);
        const view = Object.freeze({
            ...(dismissal ? {
                [presentationViewBrand]: true as const,
                dismiss: () => access.enqueue(dismissal() as A, owner)
            } : {}),
            get state() {
                return read();
            }, dispatch: (action: CA) => access.enqueue(slot.wrap(action), owner), select: <T>(selector: (state: C | undefined) => T) => selector(read()), subscribe: (listener: (state: C | undefined) => void) => {
                let initialized = false;
                let previous: C | undefined;
                return access.subscribe(owner, () => {
                    const current = read();
                    if (initialized && Object.is(previous, current)) return;
                    initialized = true;
                    previous = current;
                    return listener(current);
                });
            }
        });
        if (dismissal) presentationViews.add(view);
        registerCapturedView(view, {
            root: store, origin: owner,
            matchesSlot(candidate) {
                const other = candidate as Partial<SlotHandle<S, A, C, CA>>;
                const lineage = other[slotLineage];
                return !!lineage && lineage.length === slot[slotLineage].length
                    && lineage.every((part, index) => part === slot[slotLineage][index])
                    && !!other.path && other.path.length === slot.path.length
                    && isOwnerPathWithin(other.path, slot.path);
            },
            isLive: () => access.isLive() && isOwnerLive(access.lifecycle(), owner),
            registerResource(options) {
                if (!access.isLive() || !isOwnerLive(access.lifecycle(), owner))
                    throw new Error('Cannot register a retired target');
                return access.registerResource({ ...options, ownerToken: owner });
            },
            observeCleanup(cleanup) {
                // A cleanup checkpoint, not permission to start work for a dead owner.
                access.registerResource({ ownerToken: owner, cleanup, description: 'Property lease cleanup' }).dispose();
            },
            observeActions: listener => access.subscribeActions(owner, listener)
        });
        slots.set(slot, view as ChildView<unknown, unknown>);
        return view;
    }
}
export class ManagedIntegrationBuilder<S, A, D, Catalog extends SlotCatalog = {}> {
    private readonly viewEntries: CompositionViewEntry[] = [];
    private readonly children: Integration<S, A, D>[] = [];
    private readonly fields = new Set<string>();
    constructor(private readonly core: Reducer<S, A, D>) {
    }
    with<R extends DestinationReducers, const K extends string, const CA extends DestinationAction<R> = DestinationAction<R>>(slot: DestinationSlot<S, A, R, K>, policy?: Omit<ChildPolicy<S, A, DestinationState<R>, DestinationAction<R>, D>, 'startup'> & { startup?: ((state: DestinationState<R>, deps: D) => CA | undefined) | undefined }): ManagedIntegrationBuilder<S, A, D, Catalog & Record<K, DestinationSlotSchema<R>>>;
    with<C, const CA, const K extends string = string, CC extends SlotCatalog = {}>(slot: OptionalSlot<S, A, C, CA, K>, child: Reducer<C, CA, D> | ManagedComposition<C, CA, D, CC>, policy?: ChildPolicy<S, A, C, CA, D>): ManagedIntegrationBuilder<S, A, D, Catalog & Record<K, SlotSchema<C, CA, CC, true>>>;
    with(slot: OptionalSlot<S, A, any, any> | DestinationSlot<S, A, any>, child?: Reducer<any, any, D> | ManagedComposition<any, any, D> | ChildPolicy<S, A, any, any, D>, policy?: ChildPolicy<S, A, any, any, D>): any {
        const internal = destinationSlots.get(slot);
        if (internal) {
            let isDestination = false;
            try { destinationCases(child); isDestination = true; } catch { /* Membership-only check. */ }
            if (arguments.length > 2 || typeof child === 'function' || child instanceof ManagedComposition || isDestination || (child !== undefined && (child === null || typeof child !== 'object')))
                throw new TypeError('A destination slot carries its own reducer; pass only a policy');
            const destinationPolicy = (child ?? {}) as ChildPolicy<S, A, any, any, D>;
            for (const key of ['replaceOn', 'onCreate', 'startup'] as const)
                if (destinationPolicy[key] !== undefined && typeof destinationPolicy[key] !== 'function') throw new TypeError('A destination slot carries its own reducer; pass only a policy');
            validateDismissal(destinationPolicy.dismissal);
            this.register(slot.field);
            this.viewEntries.push(Object.freeze({ field: slot.field, kind: 'destination', slot, child: undefined, cases: internal.metadata.keys }));
            this.children.push(destinationIntegration(slot as DestinationSlot<S, A, any>, internal, destinationPolicy));
            return this;
        }
        return this.withOptional(slot as OptionalSlot<S, A, any, any>, child as Reducer<any, any, D> | ManagedComposition<any, any, D>, policy);
    }
    private withOptional<C, CA, K extends string, CC extends SlotCatalog>(slot: OptionalSlot<S, A, C, CA, K>, child: Reducer<C, CA, D> | ManagedComposition<C, CA, D, CC>, policy: ChildPolicy<S, A, C, CA, D> = {}): ManagedIntegrationBuilder<S, A, D, Catalog & Record<K, SlotSchema<C, CA, CC, true>>> {
        let brandedDestination = false;
        try { destinationCases(child); brandedDestination = true; } catch { /* Membership-only check. */ }
        if (isDestinationReducer(child) || brandedDestination)
            throw new TypeError('Use destinationSlot for a createDestination-managed field');
        if (!slot || !managedSlotHandles.has(slot) || !slot[slotLineage]?.length || typeof slot.read !== 'function' || typeof slot.write !== 'function' || typeof slot.wrap !== 'function' || typeof slot.unwrap !== 'function')
            throw new TypeError('Expected a typed managed slot token');
        if (typeof child !== 'function' && !(child instanceof ManagedComposition))
            throw new TypeError('Managed child must be a reducer or managed composition');
        validateDismissal(policy?.dismissal);
        this.register(slot.field);
        const composed = child instanceof ManagedComposition ? child : undefined;
        const reducer = composed?.reducer ?? child as Reducer<C, CA, D>;
        this.viewEntries.push(Object.freeze({field: slot.field, kind: 'optional', slot, child: composed}));
        // The slot's own dismissal as an ordinary parent action: the lifts below claim a managed dismiss request for it.
        const claim: LiftPolicy<A> = { kind: 'claim', dismissal: () => ({ type: slot.field, action: { type: 'dismiss' } } as A) };
        this.children.push({
            accepts: lineage => lineage[0] === slot[slotLineage][0] && (lineage.length === 1 || composed?.accepts(lineage.slice(1)) === true),
            paths: (state, prefix) => {
                const value = slot.read(state);
                const path = [...prefix, ...slot.path];
                return value == null ? [] : [path, ...(composed?.paths(value, path) ?? [])];
            },
            reduce: (state, action, deps, context) => {
                const value = slot.read(state), routed = slot.unwrap(action);
                if (value == null || !routed)
                    return {
                        state, effect: Effect.none(), replacements: []
                    };
                if (routed.type === 'dismiss') {
                    if (policy.dismissal === 'deferred')
                        return {
                            state, effect: Effect.none(), replacements: []
                        };
                    return { 
                        state: slot.write(state, null), effect: Effect.none(), replacements: []
                    };
                }
                const path = [...context.prefix, ...slot.path];
                const owner = ownerAt(context.lifecycle, path);
                if (!owner)
                    throw new Error('Managed child has no incoming owner');
                context.deliveries?.push({ owner, action: routed.action });
                const result = composed ? composed.reduce(value, routed.action, deps, {
                    ...context, prefix: path
                }) : (() => {
                    const [next, effect] = reducer(value, routed.action, deps);
                    return {
                        state: next, effect, replacements: []
                    };
                })();
                return {
                    state: slot.write(state, result.state), effect: liftEffect(stampOrigin(result.effect, owner), slot.wrap, claim), replacements: result.replacements
                };
            },
            replacements: (before, after, action, prefix) => slot.read(before) != null && slot.read(after) != null && policy.replaceOn?.(action, before, after) ? [{
                    type: 'replace', path: [...prefix, ...slot.path]
                }] : [],
            initial: (state, deps, context, replacements) => {
                const value = slot.read(state);
                if (value == null)
                    return [];
                const path = [...context.prefix, ...slot.path];
                const entries: CreatedOwnerEffect<A>[] = [];
                if (newlyCreated(context, path, replacements)) {
                    if (policy.onCreate) entries.push({ path, effect: liftEffect(policy.onCreate(value, deps), slot.wrap, claim) });
                    const startup = policy.startup?.(value, deps);
                    if (startup !== undefined) entries.push({ path, effect: Effect.run(dispatch => dispatch(slot.wrap(startup))) });
                }
                for (const entry of composed?.initial(value, deps, {
                    ...context, prefix: path
                }, replacements) ?? [])
                    entries.push({
                        ...entry, effect: Effect.map(entry.effect, slot.wrap)
                    });
                return entries;
            }
        });
        return this as unknown as ManagedIntegrationBuilder<S, A, D, Catalog & Record<K, SlotSchema<C, CA, CC, true>>>;
    }
    forEach<C, const CA, ID extends string | number, const K extends string = string, CC extends SlotCatalog = {}>(slot: KeyedSlot<S, A, C, CA, ID, K>, child: Reducer<C, CA, D> | ManagedComposition<C, CA, D, CC>, policy: KeyedChildPolicy<A, C, CA, ID, D> = {}): ManagedIntegrationBuilder<S, A, D, Catalog & Record<K, SlotSchema<C, CA, CC, false>>> {
        if (isDestinationReducer(child))
            throw new TypeError('Use destinationSlot inside a managed row composition for a createDestination-managed row');
        if (!keyedSlots.has(slot) || !slot[slotLineage]?.length)
            throw new TypeError('Expected a typed managed slot token');
        if (typeof child !== 'function' && !(child instanceof ManagedComposition))
            throw new TypeError('Managed child must be a reducer or managed composition');
        this.register(slot.field);
        const composed = child instanceof ManagedComposition ? child : undefined;
        const reducer = composed?.reducer ?? child as Reducer<C, CA, D>;
        this.viewEntries.push(Object.freeze({field: slot.field, kind: 'keyed', slot, child: composed}));
        this.children.push({
            accepts: lineage => lineage[0] === slot[slotLineage][0] && (lineage.length === 1 || composed?.accepts(lineage.slice(1)) === true),
            paths: (state, prefix) => slot.items(state).flatMap(item => {
                const path = [...prefix, ...slot.at(item.id).path];
                return [path, ...(composed?.paths(item.state, path) ?? [])];
            }),
            reduce: (state, action, deps, context) => {
                const routed = slot.unwrap(action);
                if (!routed)
                    return {
                        state, effect: Effect.none(), replacements: []
                    };
                const items = slot.items(state);
                const index = items.findIndex(item => Object.is(item.id, routed.id));
                if (index < 0)
                    return {
                        state, effect: Effect.none(), replacements: []
                    };
                const item = items[index]!;
                const handle = slot.at(item.id);
                const path = [...context.prefix, ...handle.path];
                const owner = ownerAt(context.lifecycle, path);
                if (!owner)
                    throw new Error('Managed element has no incoming owner');
                context.deliveries?.push({ owner, action: routed.action });
                const result = composed ? composed.reduce(item.state, routed.action, deps, {
                    ...context, prefix: path
                }) : (() => {
                    const [next, effect] = reducer(item.state, routed.action, deps);
                    return {
                        state: next, effect, replacements: []
                    };
                })();
                const next = [...items];
                next[index] = {
                    ...item, state: result.state
                };
                return {
                    state: slot.write(state, next), effect: Effect.map(stampOrigin(result.effect, owner), handle.wrap), replacements: result.replacements
                };
            },
            replacements: (before, after, action, prefix) => slot.items(after).flatMap(item => {
                const old = slot.items(before).find(previous => Object.is(previous.id, item.id));
                return old && policy.replaceOn?.(action, item.id, old.state, item.state) ? [{
                        type: 'replace', path: [...prefix, ...slot.at(item.id).path]
                    }] : [];
            }),
            initial: (state, deps, context, replacements) => slot.items(state).flatMap(item => {
                const handle = slot.at(item.id);
                const path = [...context.prefix, ...handle.path];
                const entries: CreatedOwnerEffect<A>[] = [];
                if (newlyCreated(context, path, replacements)) {
                    if (policy.onCreate) entries.push({ path, effect: Effect.map(policy.onCreate(item.state, deps), handle.wrap) });
                    const startup = policy.startup?.(item.state, deps);
                    if (startup !== undefined) entries.push({ path, effect: Effect.run(dispatch => dispatch(handle.wrap(startup))) });
                }
                for (const entry of composed?.initial(item.state, deps, {
                    ...context, prefix: path
                }, replacements) ?? [])
                    entries.push({
                        ...entry, effect: Effect.map(entry.effect, handle.wrap)
                    });
                return entries;
            })
        });
        return this as unknown as ManagedIntegrationBuilder<S, A, D, Catalog & Record<K, SlotSchema<C, CA, CC, false>>>;
    }
    private register(field: string): void {
        if (this.fields.has(field))
            throw new Error(`Managed slot '${field}' already registered`);
        this.fields.add(field);
    }
    build(): ManagedComposition<S, A, D, Catalog> {
        return new ManagedComposition(this.core, [...this.children], this.viewEntries);
    }
}

/** One destination case is one owner; the captured destination reducer retains routing/group semantics. */
function destinationIntegration<S, A, D>(slot: DestinationSlot<S, A, any>, internal: DestinationSlotInternal, policy: ChildPolicy<S, A, any, any, D>): Integration<S, A, D> {
    const occupant = (state: S): { type: string; state: unknown } | null => {
        const value = (state as Record<string, unknown>)[slot.field];
        if (value == null) return null;
        if (typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string' || !Object.hasOwn(value, 'state') || !Object.hasOwn(internal.metadata.routes, (value as { type: string }).type))
            throw new TypeError(`Destination slot '${slot.field}' occupant is outside the createDestination catalog`);
        return value as { type: string; state: unknown };
    };
    const pathFor = (value: { type: string }, prefix: OwnerPath): OwnerPath => [...prefix, ...internal.handles.get(value.type)!.path];
    const wrap = (action: unknown): A => ({ type: slot.field, action: { type: 'presented', action } } as A);
    const claim: LiftPolicy<A> = {
        kind: 'claim',
        dismissal: () => ({ type: slot.field, action: { type: 'dismiss' } } as A)
    };
    return {
        accepts: lineage => lineage.length === 1 && lineage[0] === slot[slotLineage][0],
        paths: (state, prefix) => { const value = occupant(state); return value ? [pathFor(value, prefix)] : []; },
        reduce: (state, action, deps, context) => {
            const value = occupant(state);
            const routed = action as { type?: unknown; action?: PresentationAction<any> };
            if (!value || routed?.type !== slot.field || !routed.action) return { state, effect: Effect.none(), replacements: [] };
            if (routed.action.type === 'dismiss') {
                if (policy.dismissal === 'deferred') return { state, effect: Effect.none(), replacements: [] };
                return { state: { ...state, [slot.field]: null }, effect: Effect.none(), replacements: [] };
            }
            const owner = ownerAt(context.lifecycle, pathFor(value, context.prefix));
            if (!owner) throw new Error('Managed child has no incoming owner');
            const routedCase = routed.action.action as { type?: unknown; action?: unknown };
            if (routedCase?.type === value.type) context.deliveries?.push({ owner, action: routedCase.action });
            const [next, effect] = internal.metadata.reducer(value, routed.action.action, deps);
            return { state: { ...state, [slot.field]: next }, effect: liftEffect(stampOrigin(effect, owner), wrap, claim), replacements: [] };
        },
        replacements: (before, after, action, prefix) => {
            const previous = occupant(before), next = occupant(after);
            return previous && next && previous.type === next.type && policy.replaceOn?.(action, before, after)
                ? [{ type: 'replace', path: pathFor(next, prefix) }] : [];
        },
        initial: (state, deps, context, replacements) => {
            const value = occupant(state);
            if (!value) return [];
            const path = pathFor(value, context.prefix);
            if (!newlyCreated(context, path, replacements)) return [];
            const entries: CreatedOwnerEffect<A>[] = [];
            if (policy.onCreate) entries.push({ path, effect: liftEffect(policy.onCreate(value, deps), wrap, claim) });
            const startup = policy.startup?.(value, deps);
            if (startup !== undefined) entries.push({ path, effect: Effect.run(dispatch => dispatch(wrap(startup))) });
            return entries;
        }
    };
}
