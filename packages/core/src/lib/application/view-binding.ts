import { capturedView, isManagedProjection, bindManagedProjection, assertManagedProjectionComposition, managedProjectionIsLive, managedRootAccess, type ManagedProjection, type CapturedView } from '../execution/store-access.js';
import { compositionViewEntries, nestedSlot, type SlotHandle, type SlotCatalog, type ChildView, type KeyedSlot, type OptionalSlot, type DestinationSlot, type CompositionViewEntry } from '../navigation/managed-integration.js';
import type { Store } from '../types.js';
import { viewDefinitionInternal, type ViewDefinition, type ViewDeclarationInternal } from './view-definition.js';
const handleBrand: unique symbol = Symbol('feature view');
export interface FeatureView<S, A, C extends SlotCatalog = SlotCatalog> { readonly [handleBrand]: (state:S, action:A, children:C)=>[S,A,C]; }
export type ViewHandles<C extends SlotCatalog> = {readonly [K in keyof C]: FeatureView<C[K]['state'], C[K]['action'], C[K]['children']>};
interface HandleInternal {
    readonly root: ManagedProjection<any, any>;
    readonly live: ()=>boolean;
    readonly bind: (slot:SlotHandle<any,any,any,any>)=>ChildView<any,any>|undefined;
    readonly definition: ReturnType<typeof viewDefinitionInternal>;
    readonly entry: CompositionViewEntry;
    readonly spec: ViewDeclarationInternal;
    readonly prefix: SlotHandle<any, any, any, any> | undefined;
    readonly optional: SlotHandle<any,any,any,any> | undefined;
    readonly slots: Map<string|number|symbol,SlotHandle<any,any,any,any>>;
    readonly parent: CapturedView | undefined;
    readonly instances: WeakMap<object, ViewInstance>;
}
export interface ViewInstance {
    readonly key: object;
    readonly store: ChildView<any, any>;
    readonly views: ViewHandles<any>;
    readonly render: ViewDeclarationInternal['render'];
    readonly content: ViewDeclarationInternal['content'];
}
const handles = new WeakMap<object, HandleInternal>();
const placementOwners=new WeakMap<object,object>();
const negativeZeroKey=Symbol('negative-zero item key');
function createHandles(root: ManagedProjection<any, any>, definition: ReturnType<typeof viewDefinitionInternal>, bind:HandleInternal['bind'], live:()=>boolean, prefix?: SlotHandle<any,any,any,any>, parent?: CapturedView): ViewHandles<any> {
    const result: Record<string, FeatureView<any,any,any>> = Object.create(null);
    for (const entry of compositionViewEntries(definition.composition)) {
        const handle = Object.freeze({[handleBrand]:(s:any,a:any,c:any)=>[s,a,c] as [any,any,any]});
        let optional: SlotHandle<any, any, any, any> | undefined;
        const slots = new Map<string | number | symbol, SlotHandle<any, any, any, any>>();
        switch (entry.kind) {
            case 'optional': {
                const local = entry.slot as OptionalSlot<any, any, any, any>;
                optional = prefix ? nestedSlot(prefix, local) : local;
                break;
            }
            case 'keyed': {
                break;
            }
            case 'destination': {
                const token = entry.slot as DestinationSlot<any, any, any>;
                for (const k of entry.cases ?? []) {
                    const local = token.case(k);
                    slots.set(k, prefix ? nestedSlot(prefix, local) : local);
                }
                break;
            }
            default: {
                const exhaustive: never = entry.kind;
                throw new Error(`Unhandled entry kind: ${exhaustive}`);
            }
        }
        handles.set(handle, { root, bind, live, definition, entry, spec: definition.declarations.get(entry.field)!, prefix, optional, slots, parent, instances: new WeakMap() });
        result[entry.field]=handle;
    }
    placementOwners.set(result,parent?.origin??root);
    return Object.freeze(result);
}
/** Internal adapter shared by the component wrapper and raw managed-store integration. */
export function bindViewDefinition<S,A,C extends SlotCatalog>(store:ManagedProjection<S,A>, definition:ViewDefinition<NoInfer<S>,NoInfer<A>,C>):ViewHandles<C> {
    const plan=viewDefinitionInternal(definition);
    let live:()=>boolean;
    if(isManagedProjection(store)){assertManagedProjectionComposition(store,plan.composition.execution);live=()=>managedProjectionIsLive(store);}
    else {const access=managedRootAccess(store as Store<S,A>,plan.composition.execution);live=()=>access.isLive();}
    const bind:HandleInternal['bind']=isManagedProjection(store)?slot=>bindManagedProjection(store,slot):slot=>plan.composition.bind(store as Store<S,A>,slot);
    return createHandles(store,plan,bind,live) as ViewHandles<C>;
}
export function resolveView(value: object): readonly ViewInstance[] {
    const handle=handles.get(value);
    if(!handle)throw new TypeError('Expected a framework feature view binding');
    if(!handle.live()){handle.slots.clear();return [];}
    if(handle.parent && !handle.parent.isLive()){handle.slots.clear();return [];}
    if(handle.spec.headless)return [];
    const {root,entry,prefix}=handle;
    switch (entry.kind) {
        case 'optional': {
            const slot = handle.optional!;
            const store = handle.bind(slot);
            if (!store) return [];
            const capture = capturedView(store);
            let instance = handle.instances.get(capture.origin);
            if (!instance) {
                const child = handle.spec.children ? viewDefinitionInternal(handle.spec.children) : undefined;
                instance = Object.freeze({ key: capture.origin, store, views: child ? createHandles(root, child, handle.bind, handle.live, slot, capture) : Object.freeze({}), render: handle.spec.render, content: handle.spec.content });
                handle.instances.set(capture.origin, instance);
            }
            return [instance];
        }
        case 'keyed': {
            const parentState = prefix ? prefix.read(root.state) : root.state;
            if (parentState == null) { handle.slots.clear(); return []; }
            const keyed = entry.slot as KeyedSlot<any, any, any, any, any>;
            const liveKeys = new Set<string | number | symbol>();
            const slots: SlotHandle<any, any, any, any>[] = [];
            for (const item of keyed.items(parentState)) {
                const key = Object.is(item.id, -0) ? negativeZeroKey : item.id;
                liveKeys.add(key);
                let slot = handle.slots.get(key);
                if (!slot) {
                    const local = keyed.at(item.id);
                    slot = prefix ? nestedSlot(prefix, local) : local;
                    handle.slots.set(key, slot);
                }
                slots.push(slot);
            }
            for (const key of handle.slots.keys()) if (!liveKeys.has(key)) handle.slots.delete(key);
            const output: ViewInstance[] = [];
            for (const slot of slots) {
                const store = handle.bind(slot);
                if (!store) continue;
                const capture = capturedView(store);
                let instance = handle.instances.get(capture.origin);
                if (!instance) {
                    const child = handle.spec.children ? viewDefinitionInternal(handle.spec.children) : undefined;
                    instance = Object.freeze({ key: capture.origin, store, views: child ? createHandles(root, child, handle.bind, handle.live, slot, capture) : Object.freeze({}), render: handle.spec.render, content: handle.spec.content });
                    handle.instances.set(capture.origin, instance);
                }
                output.push(instance);
            }
            return output;
        }
        case 'destination': {
            const token = entry.slot as DestinationSlot<any, any, any>;
            for (const k of entry.cases ?? []) {
                let slot = handle.slots.get(k);
                if (!slot) {
                    const local = token.case(k);
                    slot = prefix ? nestedSlot(prefix, local) : local;
                    handle.slots.set(k, slot);
                }
                const store = handle.bind(slot);
                if (!store) continue;
                const caseSpec = handle.spec.cases?.get(k);
                if (!caseSpec || caseSpec.headless) return [];
                const capture = capturedView(store);
                let instance = handle.instances.get(capture.origin);
                if (!instance) {
                    instance = Object.freeze({ key: capture.origin, store, views: Object.freeze({}), render: caseSpec.render, content: caseSpec.content });
                    handle.instances.set(capture.origin, instance);
                }
                return [instance];
            }
            return [];
        }
        default: {
            const exhaustive: never = entry.kind;
            throw new Error(`Unhandled entry kind: ${exhaustive}`);
        }
    }
}

export function placementDeclarations(views:object):ReadonlyMap<object,{field:string;required:boolean}>{
 const result=new Map<object,{field:string;required:boolean}>();
 for(const [field,view] of Object.entries(views)){
  const handle=handles.get(view);
  if(!handle)throw new TypeError('Expected framework view handles');
  let required=!handle.spec.headless;
  if(handle.spec.cases)required=Array.from(handle.spec.cases.values()).some(c=>!c.headless);
  result.set(view,{field,required});
 }
 return result;
}

export function placementOwner(views:object):object|undefined{return placementOwners.get(views);}

/** Internal: does this handle render exactly `slot` at the root layout (not nested under a captured owner)? */
export function isRootSlotView(view: object, slot: object): boolean {
    const handle = handles.get(view);
    return !!handle && handle.prefix === undefined && handle.parent === undefined && handle.entry.slot === slot;
}
