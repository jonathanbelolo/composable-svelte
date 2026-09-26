import type { Component, Snippet } from 'svelte';
import type { Action } from 'svelte/action';
import { ManagedComposition, compositionViewEntries, type ChildView, type PresentationView, type SlotCatalog, type SlotSchema } from '../navigation/managed-integration.js';
import type { ViewHandles } from './view-binding.js';
const definitionBrand: unique symbol = Symbol('view definition');
export interface FeatureViewProps<S, A, Children extends SlotCatalog = {}> {
    readonly store: ChildView<S, A>;
    readonly views: ViewHandles<Children>;
    readonly surface: Action<HTMLElement>;
}
/** Props for a framework-owned optional child or destination case. */
export interface PresentationFeatureViewProps<S, A, Children extends SlotCatalog = {}>
    extends Omit<FeatureViewProps<S, A, Children>, 'store'> {
    readonly store: PresentationView<S, A>;
}
// State/action inference is supplied by the slot schema, not by component props.
type PlanChildren<S, A, C extends SlotCatalog> = keyof C extends never
    ? { readonly children?: never }
    : { readonly children: ViewDefinition<S, A, C> };
type DestinationCaseDeclaration<S, A> =
    | { readonly headless: true; readonly render?: never; readonly content?: never; readonly children?: never; readonly cases?: never }
    | { readonly render: Component<PresentationFeatureViewProps<S, A, {}>>; readonly content?: never; readonly headless?: never; readonly children?: never; readonly cases?: never }
    | { readonly content: Snippet<[PresentationFeatureViewProps<S, A, {}>]>; readonly render?: never; readonly headless?: never; readonly children?: never; readonly cases?: never };
type DestinationCaseDeclarations<Cases> = {
    readonly [P in keyof Cases]: Cases[P] extends { state: infer S; action: infer A }
        ? DestinationCaseDeclaration<S, A>
        : DestinationCaseDeclaration<unknown, unknown>;
};
type PropsForSlot<T extends SlotSchema> = T extends SlotSchema<infer S, infer A, infer Children, infer Presentation>
    ? Presentation extends true
        ? PresentationFeatureViewProps<S, A, Children>
        : FeatureViewProps<S, A, Children>
    : never;
export type ViewDeclarations<C extends SlotCatalog> = {
    readonly [K in keyof C]: C[K] extends { cases: infer Cases }
        ? (
            | { readonly headless: true; readonly render?: never; readonly content?: never; readonly children?: never; readonly cases?: never }
            | { readonly cases: DestinationCaseDeclarations<Cases>; readonly headless?: never; readonly render?: never; readonly content?: never; readonly children?: never }
        )
        : (
            | { readonly headless: true; readonly render?: never; readonly content?: never; readonly children?: never; readonly cases?: never }
            | (PlanChildren<C[K]['state'], C[K]['action'], C[K]['children']> & (
                | { readonly render: Component<PropsForSlot<C[K]>>; readonly content?: never; readonly headless?: never; readonly cases?: never }
                | { readonly content: Snippet<[PropsForSlot<C[K]>]>; readonly render?: never; readonly headless?: never; readonly cases?: never }
            ))
        );
};
export interface ViewDefinition<S, A, C extends SlotCatalog> {
    readonly [definitionBrand]: (state: S, action: A, catalog: C) => [S, A, C];
}
export interface ViewDeclarationInternal {
    readonly headless: boolean;
    readonly render?: Component<any> | undefined;
    readonly content?: Snippet<[FeatureViewProps<any, any, any>]> | undefined;
    readonly children?: ViewDefinition<any, any, any> | undefined;
    readonly cases?: ReadonlyMap<string, ViewDeclarationInternal> | undefined;
}
export interface ViewDefinitionInternal {
    readonly composition: ManagedComposition<any, any, any>;
    readonly declarations: ReadonlyMap<string, ViewDeclarationInternal>;
}
const definitions = new WeakMap<object, ViewDefinitionInternal>();
export function viewDefinitionInternal(value: object): ViewDefinitionInternal {
    const found = definitions.get(value);
    if (!found) throw new TypeError('Expected a definition created by defineViews');
    return found;
}
/** Exhaustive schema-level rendering declaration. Headless intentionally covers that entire subtree. */
export function defineViews<S, A, D, C extends SlotCatalog>(composition: ManagedComposition<S, A, D, C>, declarations: ViewDeclarations<NoInfer<C>>): ViewDefinition<S, A, C> {
    const entries = compositionViewEntries(composition);
    if (!declarations || typeof declarations !== 'object') throw new TypeError('View declarations are required');
    const keys = Object.keys(declarations);
    if (keys.length !== entries.length || entries.some(entry => !Object.hasOwn(declarations, entry.field)))
        throw new TypeError('Every composed slot requires exactly one render, content, or headless declaration');
    const normalized = new Map<string, ViewDeclarationInternal>();
    for (const entry of entries) {
        const spec = (declarations as Record<string, any>)[entry.field];
        if (!spec || typeof spec !== 'object') throw new TypeError(`Invalid view declaration for '${entry.field}'`);
        if (entry.kind !== 'destination' && spec.cases !== undefined)
            throw new TypeError(`Slot '${entry.field}' cannot declare cases`);
        if (entry.kind === 'destination' && (spec.render !== undefined || spec.content !== undefined || spec.children !== undefined))
            throw new TypeError(`Destination slot '${entry.field}' declares views per case`);
        const modes = Number(spec.headless === true) + Number(typeof spec.render === 'function') + Number(typeof spec.content === 'function') + Number(spec.cases !== undefined);
        if (modes !== 1 || (spec.headless !== undefined && spec.headless !== true)) throw new TypeError(`Slot '${entry.field}' requires exactly one rendering mode`);
        if (spec.headless) {
            if (spec.children !== undefined || spec.render !== undefined || spec.content !== undefined || spec.cases !== undefined) throw new TypeError(`Headless slot '${entry.field}' cannot also render`);
            normalized.set(entry.field, Object.freeze({headless:true}));
            continue;
        }
        if (entry.kind === 'destination') {
            const requiredCases = entry.cases ?? [];
            if (
                !spec.cases ||
                typeof spec.cases !== 'object' ||
                Object.keys(spec.cases).length !== requiredCases.length ||
                !requiredCases.every(k => Object.hasOwn(spec.cases, k))
            ) {
                throw new TypeError(`Destination slot '${entry.field}' requires cases: ${requiredCases.join(', ')}`);
            }
            const caseMap = new Map<string, ViewDeclarationInternal>();
            for (const caseKey of requiredCases) {
                const caseSpec = (spec.cases as Record<string, any>)[caseKey];
                if (!caseSpec || typeof caseSpec !== 'object')
                    throw new TypeError(`Invalid view declaration for case '${caseKey}' of slot '${entry.field}'`);
                if (caseSpec.children !== undefined || caseSpec.cases !== undefined)
                    throw new TypeError(`Case '${caseKey}' of destination slot '${entry.field}' cannot declare children or cases`);
                const caseModes = Number(caseSpec.headless === true) + Number(typeof caseSpec.render === 'function') + Number(typeof caseSpec.content === 'function');
                if (caseModes !== 1 || (caseSpec.headless !== undefined && caseSpec.headless !== true))
                    throw new TypeError(`Case '${caseKey}' of destination slot '${entry.field}' requires exactly one rendering mode`);
                if (caseSpec.headless) {
                    if (caseSpec.render !== undefined || caseSpec.content !== undefined)
                        throw new TypeError(`Headless case '${caseKey}' of destination slot '${entry.field}' cannot also render`);
                    caseMap.set(caseKey, Object.freeze({ headless: true }));
                } else {
                    if ((caseSpec.render !== undefined && typeof caseSpec.render !== 'function') || (caseSpec.content !== undefined && typeof caseSpec.content !== 'function'))
                        throw new TypeError(`Invalid renderer for case '${caseKey}' of destination slot '${entry.field}'`);
                    caseMap.set(caseKey, Object.freeze({ headless: false, render: caseSpec.render, content: caseSpec.content }));
                }
            }
            normalized.set(entry.field, Object.freeze({ headless: false, cases: Object.freeze(caseMap) }));
            continue;
        }
        if (spec.render !== undefined && typeof spec.render !== 'function' || spec.content !== undefined && typeof spec.content !== 'function')
            throw new TypeError(`Invalid renderer for '${entry.field}'`);
        const childEntries = entry.child ? compositionViewEntries(entry.child) : [];
        if (childEntries.length) {
            if (!spec.children || viewDefinitionInternal(spec.children).composition !== entry.child)
                throw new TypeError(`Slot '${entry.field}' requires its exact child's exhaustive view definition`);
        } else if (spec.children !== undefined) throw new TypeError(`Leaf slot '${entry.field}' has no nested view bindings`);
        normalized.set(entry.field, Object.freeze({headless:false,render:spec.render,content:spec.content,children:spec.children}));
    }
    const definition = Object.freeze({[definitionBrand]:(state:S,action:A,catalog:C):[S,A,C]=>[state,action,catalog]});
    definitions.set(definition,{composition,declarations:normalized});
    return definition;
}
/** Derive component props directly from its existing composed feature. */
export type FeatureViewPropsOf<T> = T extends ManagedComposition<infer S, infer A, any, infer C> ? FeatureViewProps<S, A, C> : never;
