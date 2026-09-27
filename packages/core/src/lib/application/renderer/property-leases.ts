/** Internal instant writer. Playback and driver APIs are deliberately absent. */
import type {MotionProperty} from '../motion/properties.js';
export type Property = MotionProperty;
export class ArbitrationRejectionError extends Error {
  constructor(message = 'Conflicting motion property group requires an explicit winning priority or the same channel') {
    super(message);
    this.name = 'ArbitrationRejectionError';
  }
}
export interface PropertyLease {
  readonly live: boolean;
  write(value: string): void;
  release(): void;
  /**
   * Retire without restoring: for a node leaving the document in this same flush (value handoff at
   * beforeRemoval). No stable value is written; cleanup still runs. A newer holder is unaffected.
   */
  abandon(): void;
}
interface Channel {
  stable: string;
  /** Legacy projections by opaque registration identity; the latest update is last. */
  legacy?: Map<object, string> | undefined;
  current?: PropertyLease | undefined;
  group?: PropertyGroup | undefined;
}
function latestLegacy(channel: Channel): string | undefined {
  let latest: string | undefined;
  if (channel.legacy) for (const value of channel.legacy.values()) latest = value;
  return latest;
}
export class PropertyAuthority {
  private readonly channels = new Map<Property, Channel>();
  /** Identity for legacy projections published without a registration. */
  private readonly anonymous: object = {};
  private disposed = false;
  constructor(private write: (property: Property, value: string) => void, private readonly onError: (error: unknown) => void = error => console.error('[Composable Svelte] Property cleanup error:', error)) {}

  get hasLeases():boolean{return [...this.channels.values()].some(channel=>channel.current!==undefined);}
  /** Read-only ownership inspection for cooperating writers (choreography): current lease, group, stable. */
  holder(property: Property): {readonly lease: PropertyLease | undefined; readonly grouped: boolean; readonly stable: string | undefined} {
    const channel = this.channels.get(property);
    return {lease: channel?.current, grouped: !!channel?.group, stable: channel?.stable};
  }

  report(error:unknown):void{try{void Promise.resolve(this.onError(error)).catch(()=>{});}catch{}}

  /** Remove one retiring registration's legacy projections; nothing is rewritten. */
  withdraw(source: object): void {
    for (const channel of this.channels.values()) channel.legacy?.delete(source);
  }

  stable(property: Property, value: string, source: object = this.anonymous): void {
    if (this.disposed) return;
    let channel = this.channels.get(property);
    if (!channel) {
      channel = { stable: value };
      this.channels.set(property, channel);
    }
    // Latest update wins: reinsertion moves this registration to the end.
    const legacy = channel.legacy ??= new Map<object, string>();
    legacy.delete(source);
    legacy.set(source, value);
    // A managed group owns the visible projection until it retires without successor.
    if (channel.group) return;
    channel.stable = value;
    if (!channel.current) this.write(property, value);
  }

  lease(property: Property, alive: () => boolean, cleanup: () => void = () => {}): PropertyLease {
    if (this.disposed || !alive()) throw new Error('Cannot lease a retired target');
    const channel = this.channels.get(property);
    if (!channel) throw new Error('A stable projection must precede a property lease');
    if (channel.group) throw new Error('Property belongs to a managed binding group');
    return this.acquireLease(property, alive, cleanup);
  }

  private acquireLease(property: Property, alive: () => boolean, cleanup: () => void): PropertyLease {
    const channel = this.channels.get(property)!;
    const previous = channel.current;
    let retired = false;
    const authority = this;
    const lease: PropertyLease = {
      get live() { return !retired && !authority.disposed && alive() && channel.current === lease; },
      write(value) { if (lease.live) authority.write(property, value); },
      abandon() {
        if (retired) return;
        retired = true;
        if (channel.current === lease) channel.current = undefined;
        try { cleanup(); } catch (error) { authority.report(error); }
      },
      release() {
        if (retired) return;
        retired = true;
        // Transfer first. A disposer may synchronously request another lease.
        const wasCurrent = channel.current === lease;
        if (wasCurrent) channel.current = undefined;
        try { cleanup(); }
        finally {
          if (wasCurrent && !channel.current && !authority.disposed) authority.write(property, channel.stable);
        }
      }
    };
    channel.current = lease;
    // Never reinstall this successor after predecessor cleanup: that cleanup may
    // already have installed and written a newer lease.
    try { previous?.release(); }
    catch (error) { try { this.onError(error); } catch { /* Diagnostics cannot steal the successor. */ } }
    return lease;
  }

  /** All addresses are checked before publishing any ownership or invoking cleanup. */
  static claimGroup(targets: readonly PropertyGroupTarget[], policy: PropertyGroupPolicy): PropertyGroup {
    if (!policy.channel || policy.channel.length > 128 || !Number.isFinite(policy.priority))
      throw new TypeError('A binding requires a bounded channel name and finite priority');
    const members: {authority: PropertyAuthority; property: Property; value: string}[] = [];
    const seen = new Map<PropertyAuthority, Set<Property>>();
    const previous = new Set<PropertyGroup>();
    for (const target of targets) {
      if (target.authority.disposed) throw new Error('Cannot claim a disposed property authority');
      if (!target.properties.length) throw new TypeError('A binding target requires properties');
      const properties = seen.get(target.authority) ?? new Set<Property>();
      seen.set(target.authority, properties);
      for (const property of target.properties) {
        if (properties.has(property)) throw new Error('Duplicate binding property address');
        properties.add(property);
        const value = target.stable[property];
        if (typeof value !== 'string') throw new TypeError('Stable projection must serialize every declared property');
        members.push({authority:target.authority,property,value});
        const incumbent = target.authority.channels.get(property)?.group;
        if (incumbent) previous.add(incumbent);
      }
    }
    if (!members.length) throw new TypeError('A binding group requires a target');
    for (const incumbent of previous) {
      if (incumbent.priority > policy.priority || (incumbent.priority === policy.priority && incumbent.channel !== policy.channel)) {
        try{policy.diagnostic?.({kind:'rejected',channel:policy.channel,incumbent:incumbent.channel});}catch{/* diagnostics do not acquire authority */}
        throw new ArbitrationRejectionError();
      }
    }
    // A projection getter can retire an authority or introduce another claim.
    for (const member of members) {
      if (member.authority.disposed) throw new Error('Property authority retired during projection');
      const incumbent=member.authority.channels.get(member.property)?.group;
      if (incumbent && !previous.has(incumbent)) throw new Error('Property ownership changed during projection');
    }
    let retired=false;
    const own=()=>!retired && members.every(({authority,property})=>!authority.disposed && authority.channels.get(property)?.group===group);
    const retire=(superseded:boolean)=>{
      if(retired)return;retired=true;
      const leases:PropertyLease[]=[];
      const restored:{authority:PropertyAuthority;property:Property;channel:Channel}[]=[];
      for(const {authority,property} of members){
        const channel=authority.channels.get(property);
        // Only remove our own claim; successors already published their values.
        if(channel?.group===group){
          channel.group=undefined;
          // Without a successor the latest live legacy projection is stable again. A
          // current lease writes it on release; otherwise it is written below.
          const legacy=latestLegacy(channel);
          if(legacy!==undefined){channel.stable=legacy;if(!channel.current)restored.push({authority,property,channel});}
        }
        const lease=ownedLeases.get(channel!);if(lease)leases.push(lease);
      }
      ownedLeases.clear();
      for(const lease of leases){try{lease.release();}catch(error){members[0]!.authority.report(error);}}
      for(const {authority,property,channel} of restored){
        // Lease cleanup may have retired the authority or installed another owner.
        if(authority.disposed||authority.channels.get(property)!==channel||channel.group||channel.current)continue;
        try{authority.write(property,channel.stable);}catch(error){authority.report(error);}
      }
      if(superseded)policy.onSuperseded();
    };
    const ownedLeases=new Map<Channel,PropertyLease>();
    const group:PropertyGroup={
      channel:policy.channel,priority:policy.priority,get live(){return own();},
      stable(index,values){
        if(!own())return;
        const target=targets[index];if(!target)throw new Error('Unknown binding target');
        const entries=Object.entries(values) as [Property,string][];
        for(const [property,value] of entries)if(!target.properties.includes(property)||typeof value!=='string')throw new Error('Undeclared stable property');
        if(!own())return;
        for(const [property,value] of entries){if(!own())return;const channel=target.authority.channels.get(property)!;channel.stable=value;if(!channel.current)target.authority.write(property,value);}
      },
      lease(index,property,alive,cleanup=()=>{}){
        if(!own()||!alive())throw new Error('Cannot lease a retired binding group');
        const target=targets[index];if(!target?.properties.includes(property))throw new Error('Undeclared binding property');
        const channel=target.authority.channels.get(property)!;
        const lease=target.authority.acquireLease(property,()=>own()&&alive(),cleanup);
        if(lease.live)ownedLeases.set(channel,lease);
        return lease;
      },
      release(){retire(false);},supersede(){retire(true);}
    };
    for(const {authority,property,value} of members){
      const channel=authority.channels.get(property)??{stable:value};
      channel.group=group;channel.stable=value;authority.channels.set(property,channel);
    }
    for(const incumbent of previous){
      try{incumbent.supersede();}catch(error){members[0]!.authority.report(error);}
      try{policy.diagnostic?.({kind:'replaced',channel:policy.channel,incumbent:incumbent.channel});}catch{/* Diagnostics never own arbitration. */}
    }
    // Retire legacy temporary writers too; they cannot bypass the new claim.
    for(const {authority,property} of members){if(!own())break;const channel=authority.channels.get(property)!;try{channel.current?.release();}catch(error){authority.report(error);}}
    try{for(const {authority,property,value} of members){if(!own())break;authority.write(property,value);}}
    catch(error){group.release();throw error;}
    return group;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.write = () => {}; // Retained dead leases must not retain their former node.
    const groups=new Set([...this.channels.values()].flatMap(channel=>channel.group?[channel.group]:[]));
    for(const group of groups)group.release();
    const leases = [...this.channels.values()].map(channel => channel.current);
    this.channels.clear();
    const errors: unknown[] = [];
    for (const lease of leases) {
      try { lease?.release(); } catch (error) { errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Property lease cleanup failed');
  }
}

export interface PropertyGroupTarget {
 readonly authority:PropertyAuthority;
 readonly properties:readonly Property[];
 readonly stable:Readonly<Partial<Record<Property,string>>>;
}
export interface PropertyConflict {readonly kind:'rejected'|'replaced';readonly channel:string;readonly incumbent:string;}
export interface PropertyGroupPolicy {
 readonly channel:string;
 readonly priority:number;
 readonly onSuperseded:()=>void;
 readonly diagnostic?:((event:PropertyConflict)=>void)|undefined;
}
export interface PropertyGroup {
 readonly channel:string;readonly priority:number;readonly live:boolean;
 stable(target:number,values:Readonly<Partial<Record<Property,string>>>):void;
 lease(target:number,property:Property,alive:()=>boolean,cleanup?:(()=>void)|undefined):PropertyLease;
 release():void;
 supersede():void;
}
