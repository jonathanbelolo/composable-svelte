import {untrack} from 'svelte';
/** Private flush handshake: paused Svelte outro branches cannot acknowledge a new epoch. */
export class PlacementActivity {
 private epoch=$state(0);
 private readonly records=new Set<PlacementPresence>();
 create(resumed:()=>void):PlacementPresence {
  let seen=untrack(()=>this.epoch), acknowledged=false, suspended=false, released=false;
  const record:PlacementPresence={
   get live(){return !released&&!suspended;},
   acknowledge:()=>{const epoch=this.epoch;if(released)return;seen=epoch;acknowledged=true;const wasSuspended=suspended;suspended=false;if(wasSuspended)resumed();},
   classify:()=>{if(!released)suspended=acknowledged&&seen!==this.epoch;},
   release:()=>{released=true;this.records.delete(record);}
  };
  this.records.add(record);return record;
 }
 challenge(){this.epoch++;}
 settle(){for(const record of this.records)record.classify();}
 dispose(){for(const record of this.records)record.release();}
}
export interface PlacementPresence {
 readonly live:boolean;
 acknowledge():void;
 classify():void;
 release():void;
}

// Internal module seam, absent from package entry points; no mutable authority on the registry object.
const authorities=new WeakMap<object,PlacementActivity>();
export function placementActivityFor(owner:object):PlacementActivity {
 let activity=authorities.get(owner);if(!activity){activity=new PlacementActivity();authorities.set(owner,activity);}return activity;
}
