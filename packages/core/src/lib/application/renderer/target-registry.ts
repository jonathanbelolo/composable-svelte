import {placementActivityFor,type PlacementPresence} from './placement-activity.svelte.js';
import {MotionChannel,type MotionClock,type MotionPlan,type MotionRun,type MotionRunContext} from './motion-run.js';
import {tick} from 'svelte';
import type { ChildView, SlotHandle } from '../../navigation/managed-integration.js';
import { capturedView, type CapturedView } from '../../execution/store-access.js';
import { ResourceScope, safeCleanup, type CleanupFunction, type ResourceRecord, type ResourceRecordOptions } from '../../execution/resources.js';
import { PropertyAuthority, ArbitrationRejectionError, type Property, type PropertyLease, type PropertyGroup, type PropertyConflict } from './property-leases.js';
import { createDocumentPreferences, type DocumentPreferences } from './document-preference.js';

const targetTypes: unique symbol = Symbol('target types');
export interface Target<C, A, P extends Property> {
  readonly slot: object;
  readonly properties: readonly P[];
  readonly [targetTypes]: (child: C, action: A) => [C, A];
}
export function targetFor<S, A, C, CA, const P extends Property>(slot: SlotHandle<S, A, C, CA>, properties: readonly P[]): Target<C, CA, P> {
  return Object.freeze({ slot, properties: Object.freeze([...new Set(properties)]), [targetTypes]: (child: C, action: CA): [C, CA] => [child, action] });
}
export interface TargetHandle<P extends Property> {
  readonly live: boolean;
  stable(values: Readonly<Record<P, string>>): void;
  lease(property: P, cleanup?: CleanupFunction): PropertyLease;
  release(): void;
}
interface NodeEntry { root: object; references: number; authority: PropertyAuthority; }
// No browser globals are read at module initialization. Node identity survives adoption.
const retiredLeasedNodes=new WeakMap<HTMLElement,object>();
// Cross-realm safe: bind rejects anything the property writer could not address.
function isElementLike(node:unknown):node is HTMLElement {
 if((typeof node!=='object'&&typeof node!=='function')||node===null||(node as {nodeType?:unknown}).nodeType!==1)return false;
 const style=(node as {style?:unknown}).style;
 return typeof style==='object'&&style!==null&&typeof (style as {setProperty?:unknown}).setProperty==='function'&&typeof (style as {getPropertyValue?:unknown}).getPropertyValue==='function';
}
function retireLeasedNode(node:HTMLElement):void {
 const token={};retiredLeasedNodes.set(node,token);
 // Keep cancellation-restored styles unavailable through the pre-render capture.
 void tick().then(()=>{if(retiredLeasedNodes.get(node)===token)retiredLeasedNodes.delete(node);});
}
export function captureHasPropertyAuthority(surface:HTMLElement):boolean {
 const ancestors:HTMLElement[]=[];for(let node=surface.parentElement;node;node=node.parentElement)ancestors.push(node);
 for(const element of [surface,...ancestors,...surface.querySelectorAll<HTMLElement>('*')])if(retiredLeasedNodes.has(element)||nodes?.get(element)?.authority.hasLeases)return true;
 return false;
}
let nodes: WeakMap<HTMLElement, NodeEntry> | undefined;
function acquireNode(root: object, node: HTMLElement): NodeEntry {
  nodes ??= new WeakMap<HTMLElement, NodeEntry>();
  let entry = nodes.get(node);
  if (entry && entry.root !== root) throw new Error('A target node already belongs to another root owner');
  if (!entry) {
    entry = { root, references: 0, authority: new PropertyAuthority((property, value) => { if (node.style.getPropertyValue(property) !== value) node.style.setProperty(property, value); }) };
    nodes.set(node, entry);
  }
  entry.references++;
  return entry;
}
function releaseNode(node: HTMLElement, entry: NodeEntry): void {
  if (--entry.references) return;
  if (nodes?.get(node) === entry) nodes.delete(node);
  entry.authority.dispose();
}

const ownerType:unique symbol=Symbol('logical target owner');
export interface TargetOwner {readonly [ownerType]:true;}
interface OwnerResources {
 readonly identity:object;
 readonly live:()=>boolean;
 readonly register:(options:Omit<ResourceRecordOptions,'ownerToken'>)=>ResourceRecord;
 readonly observeCleanup:(cleanup:CleanupFunction)=>void;
}
export interface RootTargetResources {
 readonly clock?:MotionClock|undefined;
 readonly register:(options:Omit<ResourceRecordOptions,'ownerToken'>)=>ResourceRecord;
 readonly observeCleanup:(cleanup:CleanupFunction)=>void;
}
export interface BindingTarget {
 readonly name:string;
 readonly node:HTMLElement;
 readonly properties:readonly Property[];
 readonly stable:Readonly<Partial<Record<Property,string>>>;
}
export interface MotionBinding {
 readonly live:boolean;
 readonly record:ResourceRecord;
 readonly current?:MotionRun|undefined;
 stable(target:string,values:Readonly<Partial<Record<Property,string>>>):void;
 lease(target:string,property:Property,run:MotionRunContext,cleanup?:CleanupFunction|undefined):PropertyLease;
 start(plan:MotionPlan):MotionRun;
 release():void;
}
export interface BindingPolicy {readonly channel:string;readonly priority:number;}
interface Registration { activate(): void; record: ResourceRecord; }
export class TargetRegistry {
  private readonly logicalOwners=new WeakMap<TargetOwner,OwnerResources>();
  private readonly childOwners=new WeakMap<object,TargetOwner>();
  private rootCapability:TargetOwner|undefined;
  private readonly conflicts:PropertyConflict[]=[];
  get diagnostics():readonly PropertyConflict[]{return this.conflicts.slice();}
  private conflict(event:PropertyConflict):void{this.conflicts.push(Object.freeze({...event}));if(this.conflicts.length>32)this.conflicts.shift();}
  private readonly registrations = new Set<Registration>();
  private readonly addresses = new Map<object, Set<object>>();
  readonly #placementActivity=placementActivityFor(this);
  private readonly placements=new Map<object,{validate:()=>void;owner:object|undefined;presence:PlacementPresence|undefined;contested:(()=>boolean)|undefined}>();
  private readonly placementOwners=new Map<object,number>();
  private readonly visuals: ResourceScope;
  private visualHostRecord: ResourceRecord | undefined;
  get visualHost(): ResourceRecord | undefined { return this.visualHostRecord; }
  private attached = false;
  private disposed = false;
  private validationPending = false;
  readonly clock: MotionClock;
  readonly preferences: DocumentPreferences;
  /** Root identity shared by choreography leases and motion target entries. */
  get rootIdentity(): object { return this.root; }
  constructor(private readonly root: object, private readonly ownerLive: () => boolean, private readonly onFailure?: ((error:unknown)=>void)|undefined, private readonly rootResources?:RootTargetResources|undefined, clock?: MotionClock) {
    const resolvedClock = clock ?? rootResources?.clock;
    if (!resolvedClock) throw new TypeError('TargetRegistry requires a MotionClock');
    this.clock = resolvedClock;
    this.visuals = new ResourceScope({
      onCleanupError: error => this.observeCleanup(() => { throw error; })
    });
    this.preferences = createDocumentPreferences(
      options => this.visualRecord(options.description),
      error => this.observeCleanup(() => { throw error; })
    );
  }
  private capability(resources:OwnerResources):TargetOwner {
    const token=Object.freeze({[ownerType]:true as const});this.logicalOwners.set(token,resources);return token;
  }
  get rootOwner():TargetOwner {
    if(!this.rootResources)throw new Error('This renderer has no root target resource capability');
    return this.rootCapability??=this.capability({identity:this.root,live:this.ownerLive,register:this.rootResources.register,observeCleanup:this.rootResources.observeCleanup});
  }
  ownerFor(view:object):TargetOwner {
    const capture:CapturedView=capturedView(view);
    if(capture.root!==this.root||!capture.isLive()||!this.ownerLive()||this.disposed)throw new Error('Target owner is foreign or retired');
    let token=this.childOwners.get(capture.origin);
    if(!token){token=this.capability({identity:capture.origin,live:()=>capture.isLive(),register:options=>capture.registerResource(options),observeCleanup:cleanup=>capture.observeCleanup(cleanup)});this.childOwners.set(capture.origin,token);}
    return token;
  }
  bind(owner:TargetOwner,input:readonly BindingTarget[],policy:BindingPolicy):MotionBinding {
    const logical=this.logicalOwners.get(owner);
    if(!logical||this.disposed||!this.ownerLive()||!logical.live())throw new Error('Target owner is foreign or retired');
    // Caller getters are read exactly once, before any resource is reserved.
    const channel=policy.channel,priority=policy.priority;
    if(!channel||channel.length>128||!Number.isFinite(priority))throw new TypeError('Invalid binding channel or priority');
    const names=new Set<string>();
    const targets=input.map(target=>{
      const name=target.name,node=target.node;
      if(!name||names.has(name))throw new Error('Duplicate or empty binding target name');names.add(name);
      if(!isElementLike(node))throw new TypeError('A binding target requires an element node');
      const properties=[...target.properties];if(!properties.length||new Set(properties).size!==properties.length)throw new Error('Duplicate or empty target properties');
      const stable={...target.stable};for(const property of properties)if(typeof stable[property]!=='string')throw new TypeError('Missing serialized stable property');
      return {name,node:node as HTMLElement|undefined,properties,stable};
    });
    if(!targets.length)throw new Error('A binding requires targets');
    if(this.disposed||!this.ownerLive()||!logical.live())throw new Error('Target retired during projection');
    const record=logical.register({kind:'subscription',description:'Managed motion binding'});
    // Record cleanups run in registration order, and MotionChannel's disposer releases
    // adopted leases first. Mark leased nodes before the channel enrolls its cleanup.
    const leased=new Map<PropertyLease,number>();
    const entries:{node:HTMLElement;entry:NodeEntry}[]=[];
    record.addCleanup(()=>{for(const index of new Set(leased.values())){const node=entries[index]?.node;if(node)retireLeasedNode(node);}});
    const motion=new MotionChannel(
      record,
      this.clock,
      error => logical.observeCleanup(() => { throw error; }),
      cleanup => logical.observeCleanup(cleanup)
    );
    const runContexts=new WeakSet<MotionRunContext>();
    let group:PropertyGroup|undefined;
    const live=()=>record.live&&!this.disposed&&this.ownerLive()&&logical.live();
    let currentRun:MotionRun|undefined;
    let startGeneration=0;
    const registration:Registration={record,activate:()=>{
      if(!live()||group)return;
      try{
        for(const target of targets){const node=target.node;if(!live()||!node)return;entries.push({node,entry:acquireNode(this.root,node)});}
        if(!live())return;
        group=PropertyAuthority.claimGroup(targets.map((target,index)=>({authority:entries[index]!.entry.authority,properties:target.properties,stable:target.stable})),{channel,priority,diagnostic:event=>this.conflict(event),onSuperseded:()=>{motion.supersede();record.dispose();}});
        if(!live()||!group.live){group.release();record.dispose();}
      }catch(error){record.dispose();throw error;}
    }};
    this.registrations.add(registration);
    record.addCleanup(()=>{
      this.registrations.delete(registration);
      leased.clear();
      group?.release();group=undefined;
      for(const target of targets)target.node=undefined;
      const acquired=entries.splice(0);const errors:unknown[]=[];for(const {node,entry} of acquired){try{releaseNode(node,entry);}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'Motion target cleanup failed');
    });
    const indexFor=(name:string)=>{const index=targets.findIndex(target=>target.name===name);if(index<0)throw new Error('Unknown binding target');return index;};
    const preferences=this.preferences;
    const binding:MotionBinding={
      record,get live(){return live()&&(!group||group.live);},
      get current(){return currentRun;},
      stable(name,values){if(!live())return;const index=indexFor(name);const target=targets[index]!;const copy={...values};for(const [property,value]of Object.entries(copy))if(!target.properties.includes(property as Property)||typeof value!=='string')throw new Error('Undeclared stable property');if(!live())return;Object.assign(target.stable,copy);group?.stable(index,copy);},
      lease(name,property,run,cleanup){if(!live()||!group?.live||!run.live||!runContexts.has(run))throw new Error('A lease requires an attached live motion binding');const index=indexFor(name);let lease:PropertyLease|undefined;lease=group.lease(index,property,()=>live()&&run.live,()=>{if(lease)leased.delete(lease);if(cleanup)logical.observeCleanup(cleanup);});const acquired=lease;if(acquired.live)leased.set(acquired,index);run.adopt(()=>acquired.release());return acquired;},
      start(plan){
        if(!live()||!group?.live)throw new Error('A run requires an attached live motion binding');
        // Every caller field is read exactly once and validated before MotionChannel can
        // supersede its incumbent. A getter may retire this binding, so liveness is rechecked.
        const deadlineMs=plan.deadlineMs,execute=plan.execute,stable=plan.stable,skip=plan.skip,complete=plan.complete;
        if(skip!==undefined&&complete!==undefined)throw new TypeError('Cannot specify both skip and complete in a motion plan');
        if(!Number.isFinite(deadlineMs)||deadlineMs<0||deadlineMs>2_147_483_647)throw new RangeError('Motion deadline must be finite nonnegative milliseconds within timer range');
        if(typeof execute!=='function'||typeof stable!=='function')throw new TypeError('Motion requires execution and stable projection functions');
        if(!live()||!group?.live)throw new Error('A run requires an attached live motion binding');
        const generation=++startGeneration;
        if(complete){
          const run=motion.start({deadlineMs,complete:true,execute(){},stable:()=>stable.call(plan)});
          if(generation===startGeneration)currentRun=run;
          return run;
        }
        const nodes=entries.map(e=>e.node);
        const effectiveSkip=skip??(preferences.reduced(nodes)?'reducedMotion':undefined);
        if(!live()||!group?.live)throw new Error('A run requires an attached live motion binding');
        if(effectiveSkip!==undefined){
          const run=motion.start({deadlineMs,skip:effectiveSkip,execute(){},stable:()=>stable.call(plan)});
          if(generation===startGeneration)currentRun=run;
          return run;
        }
        const run=motion.start({
          deadlineMs,
          stable:()=>stable.call(plan),
          execute:context=>{
            runContexts.add(context);
            const unwatch=preferences.watch(nodes,()=>{
              if(context.live){
                const successorGeneration=++startGeneration;
                const successor=motion.start({deadlineMs,skip:'reducedMotion',execute(){},stable:()=>stable.call(plan)},'preferenceChanged');
                if(successorGeneration===startGeneration)currentRun=successor;
              }
            });
            context.adopt(unwatch);
            if(context.live)return execute.call(plan,context);
          }
        });
        if(generation===startGeneration)currentRun=run;
        return run;
      },
      release(){record.dispose();}
    };
    if(this.attached)registration.activate();
    return binding;
  }

  registerPlacementScope(validate:()=>void,owner?:object,presence?:PlacementPresence,contested?:()=>boolean):()=>void {
    if(this.disposed)throw new Error('Cannot register a retired layout');
    if(owner&&this.placementOwners.has(owner)&&!this.isAttached)throw new Error('Duplicate rendering layout for one feature owner');
    if(owner)this.placementOwners.set(owner,(this.placementOwners.get(owner)??0)+1);
    const registration={};this.placements.set(registration,{validate,owner,presence,contested});
    return()=>{this.placements.delete(registration);if(owner){const count=this.placementOwners.get(owner)??0;if(count<=1)this.placementOwners.delete(owner);else this.placementOwners.set(owner,count-1);}};
  }
  requestPlacementValidation():void {
    if(this.disposed||this.validationPending)return;
    this.validationPending=true;
    const finish=()=>{this.validationPending=false;if(!this.disposed&&this.isAttached)this.validatePlacements();};
    void tick().then(()=>{
      if(this.disposed||!this.isAttached){this.validationPending=false;return;}
      const contest=[...this.placementOwners.values()].some(count=>count>1)||[...this.placements.values()].some(record=>record.contested?.());
      if(contest){this.#placementActivity.challenge();return tick().then(()=>{if(!this.disposed)this.#placementActivity.settle();finish();});}
      return finish();
    }).catch(error=>{this.validationPending=false;this.fail(error);});
  }
  validatePlacements():void {
    if(this.disposed)return;
    const owners=new Map<object,number>();
    const strictOwners=new Set([...this.placements.values()].filter(record=>record.owner&&!record.presence).map(record=>record.owner));
    for(const {validate,owner,presence} of this.placements.values()){
      if(this.isAttached&&presence&&!presence.live&&!(owner&&strictOwners.has(owner)))continue;
      if(owner){const count=(owners.get(owner)??0)+1;owners.set(owner,count);if(count>1)throw new Error('Duplicate rendering layout for one feature owner');}
      validate();
    }
  }
  fail(error:unknown):void{if(this.disposed)return;try{this.dispose();}finally{try{this.onFailure?.(error);}finally{console.error('[Composable Svelte] Invalid rendering layout:',error);}}}
  observeCleanup(cleanup: CleanupFunction): void {
    if (this.rootResources) {
      this.rootResources.observeCleanup(cleanup);
    } else {
      void safeCleanup(cleanup, error => console.error('[Composable Svelte] Resource cleanup error:', error));
    }
  }
  visualRecord(description:string='Renderer placement visual'):ResourceRecord{
    if(this.disposed||!this.ownerLive())throw new Error('Cannot create a retired visual');
    if(!this.visualHostRecord&&this.rootResources){
      this.visualHostRecord=this.rootResources.register({kind:'subscription',description:'Host visuals'});
      this.visualHostRecord.addCleanup(()=>{this.visuals.dispose();return this.visuals.whenCleanupsSettled();});
    }
    return this.visuals.createRecord({kind:'subscription',description});
  }

  get size(): number { return this.registrations.size; }
  get isAttached(): boolean { return this.attached && !this.disposed; }

  register<C, A, P extends Property>(view: ChildView<C, A>, target: Target<C, A, P>, element: HTMLElement, initial: Readonly<Record<P, string>>): TargetHandle<P> {
    const capture = capturedView(view);
    if (this.disposed || !this.ownerLive() || !capture.isLive()) throw new Error('Cannot register a retired target');
    if (capture.root !== this.root || !capture.matchesSlot(target.slot)) throw new TypeError('Target does not belong to this captured slot/root');
    // Projection access may invoke getters. Validate before reserving resources,
    // then recheck both authority and the address after any reentrant work.
    let stable = { ...initial };
    if (this.disposed || !this.ownerLive() || !capture.isLive()) throw new Error('Cannot register a retired target');
    const targets = this.addresses.get(capture.origin) ?? new Set<object>();
    if (targets.has(target)) throw new Error('Duplicate live scoped target');
    targets.add(target);
    this.addresses.set(capture.origin, targets);
    let record: ResourceRecord;
    try { record = capture.registerResource({ kind: 'subscription', description: 'Managed target' }); }
    catch (error) {
      targets.delete(target);
      if (!targets.size) this.addresses.delete(capture.origin);
      throw error;
    }
    let node: HTMLElement | undefined = element;
    let entry: NodeEntry | undefined;
    const leases = new Set<PropertyLease>();
    const live = () => record.live && !this.disposed && this.ownerLive() && capture.isLive();
    const registration: Registration = {
      record,
      activate: () => {
        if (!live() || entry || !node) return;
        try {
          entry = acquireNode(this.root, node);
          for (const property of target.properties) entry.authority.stable(property, stable[property], registration);
        } catch (error) { record.dispose(); throw error; }
      }
    };
    this.registrations.add(registration);
    record.addCleanup(() => {
      this.registrations.delete(registration);
      targets.delete(target);
      if (!targets.size) this.addresses.delete(capture.origin);
      const previousNode = node, previousEntry = entry;
      if(previousNode&&leases.size)retireLeasedNode(previousNode);
      node = undefined; entry = undefined;
      // Only this registration's projection retires; aliases on the node keep theirs.
      previousEntry?.authority.withdraw(registration);
      const errors: unknown[] = [];
      for (const lease of leases) { try { lease.release(); } catch (error) { errors.push(error); } }
      leases.clear();
      try { if (previousNode && previousEntry) releaseNode(previousNode, previousEntry); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, 'Target cleanup failed');
    });
    const handle: TargetHandle<P> = {
      get live() { return live(); },
      stable: values => {
        if (!live()) return;
        stable = { ...values };
        if (entry) for (const property of target.properties) entry.authority.stable(property, stable[property], registration);
      },
      lease: (property, cleanup) => {
        if (!target.properties.includes(property)) throw new Error('Undeclared target property');
        if (!live() || !entry) throw new Error('A property lease requires an attached live target');
        let lease: PropertyLease | undefined;
        lease = entry.authority.lease(property, live, () => { if (lease) leases.delete(lease); if (cleanup) capture.observeCleanup(cleanup); });
        if (lease.live) leases.add(lease);
        return lease;
      },
      release: () => record.dispose()
    };
    if (this.attached) registration.activate();
    return handle;
  }
  attach(): void {
    if (this.disposed || !this.ownerLive()) throw new Error('Cannot attach a retired registry');
    if (this.attached) return;
    this.validatePlacements();
    this.attached = true;
    for (const registration of [...this.registrations]) {
      try { registration.activate(); }
      catch (error) {
        if (error instanceof ArbitrationRejectionError) continue;
        this.dispose();
        throw error;
      }
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.preferences.dispose();
    for (const registration of [...this.registrations]) registration.record.dispose();
    this.registrations.clear(); this.addresses.clear();this.placements.clear();this.placementOwners.clear();this.#placementActivity.dispose();this.visuals.dispose();
    this.visualHostRecord?.dispose();
  }
}

/**
 * Choreography writer through the node's single PropertyAuthority (shared with managed/legacy motion
 * targets of the same root). Never takes a property held by a foreign lease or a managed binding group:
 * those participants are captured with their displayed values and receive no choreography writes.
 * Acquiring supersedes only an earlier choreography lease (successor), which then retires without
 * restoring; releasing the current lease restores the stable projection; `abandon` retires without a
 * write (node leaving in this flush).
 */
export interface ChoreographyLease {
  readonly node: HTMLElement;
  /** Participant's own stable projection (inline value before choreography; computed numeric). */
  readonly stable: string;
  readonly stableNumber: number;
  readonly live: boolean;
  write(value: string): void;
  release(): void;
  abandon(): void;
}
const choreographyLeases = new WeakSet<PropertyLease>();
let liveLeases = 0;
/** Diagnostic: choreography leases acquired and not yet released/abandoned. */
export function liveChoreographyLeases(): number { return liveLeases; }
/** Choreography-leased properties: paint opacity, and inset clip for clipped reveal of real destinations. */
export type ChoreographyProperty = 'opacity' | 'clip-path' | 'translate';
export function acquireChoreographyLease(root: object, node: HTMLElement, choreographyProperty: ChoreographyProperty, alive: () => boolean): ChoreographyLease | { readonly foreign: string } {
  // `clip-path` is not a recipe motion property; the node authority still arbitrates it as one channel.
  const property = choreographyProperty as Property;
  let entry: NodeEntry;
  try { entry = acquireNode(root, node); } catch { return { foreign: 'foreignRoot' }; }
  const holder = entry.authority.holder(property);
  if (holder.grouped || (holder.lease && holder.lease.live && !choreographyLeases.has(holder.lease))) { releaseNode(node, entry); return { foreign: holder.grouped ? 'managedGroup' : 'foreignLease' }; }
  if (holder.stable === undefined) entry.authority.stable(property, node.style.getPropertyValue(property));
  const stable = entry.authority.holder(property).stable ?? '';
  const view = node.ownerDocument.defaultView;
  const computed = Number.parseFloat(stable || (view ? view.getComputedStyle(node).getPropertyValue(property) : '1'));
  let lease: PropertyLease;
  try { lease = entry.authority.lease(property, alive); } catch (error) { releaseNode(node, entry); return { foreign: error instanceof Error ? error.message : 'leaseRejected' }; }
  choreographyLeases.add(lease);
  liveLeases++;
  let done = false;
  const finish = (restore: boolean) => {
    if (done) return;
    done = true;
    liveLeases--;
    try { if (restore) lease.release(); else lease.abandon(); }
    finally { try { releaseNode(node, entry); } catch { /* disposal errors are diagnostics of the authority */ } }
  };
  return {
    node, stable, stableNumber: Number.isFinite(computed) ? computed : 1,
    get live() { return lease.live; },
    write: value => lease.write(value),
    release: () => finish(true),
    abandon: () => finish(false)
  };
}
/** Test/diagnostic: does a choreography lease currently hold this node's property? */
export function hasChoreographyLease(node: HTMLElement, property: 'opacity' = 'opacity'): boolean {
  const lease = nodes?.get(node)?.authority.holder(property).lease;
  return !!lease && choreographyLeases.has(lease) && lease.live;
}
