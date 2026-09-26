import {BROWSER} from 'esm-env';
import {tick} from 'svelte';
import {placementDeclarations,placementOwner} from '../view-binding.js';
import {PlacementActivity,placementActivityFor,type PlacementPresence} from './placement-activity.svelte.js';
import type {TargetRegistry} from './target-registry.js';
interface BorrowedGroup {scopes:Set<PlacementScope>;activity:PlacementActivity;pending:boolean;}
const borrowedOwners=new WeakMap<object,BorrowedGroup>();
type ClaimRelease=(()=>void)&{acknowledge:()=>void};
/** One declared layout, scoped to the root or one captured child owner. */
export class PlacementScope {
 private readonly group:BorrowedGroup|undefined;
 private readonly authority:PlacementActivity;
 private readonly presence:PlacementPresence;
 private readonly claims=new Map<object,Set<PlacementPresence>>();
 private readonly declarations:ReadonlyMap<object,{field:string;required:boolean}>;
 private disposed=false;private active=$state(true);
 get live(){return this.active;}
 private activated=false;private readonly unregister:()=>void;
 constructor(views:object,private readonly registry:TargetRegistry|undefined){
  this.declarations=placementDeclarations(views);
  const owner=placementOwner(views);
  if(BROWSER&&!registry){
   const group=(owner?borrowedOwners.get(owner):undefined)??{scopes:new Set<PlacementScope>(),activity:new PlacementActivity(),pending:false};
   if(group.scopes.size&&[...group.scopes].every(scope=>!scope.activated))throw new Error('Duplicate rendering layout for one feature owner');
   this.group=group;this.authority=group.activity;
   this.presence=this.authority.create(()=>this.changed());
   group.scopes.add(this);if(owner)borrowedOwners.set(owner,group);
   this.unregister=()=>{group.scopes.delete(this);if(owner&&!group.scopes.size)borrowedOwners.delete(owner);};
  }else{
   this.authority=registry?placementActivityFor(registry):new PlacementActivity();
   this.presence=this.authority.create(()=>this.changed());
   this.unregister=registry?.registerPlacementScope(()=>this.validate(),owner,this.presence,()=>this.contested())??(()=>{});
  }
  this.changed();
 }
 acknowledge(){this.presence.acknowledge();}
 private contested(){return [...this.claims.values()].some(tokens=>tokens.size>1);}
 claim(view:object):ClaimRelease {
  if(this.disposed)throw new Error('Cannot place an outlet in a retired layout');
  const declaration=this.declarations.get(view);if(!declaration)throw new Error('FeatureOutlet must be placed in its declared FeatureViews layout');
  if(!declaration.required)throw new Error(`Headless feature '${declaration.field}' must not have a FeatureOutlet`);
  if(this.claims.has(view)&&!this.registry?.isAttached&&!this.activated)throw new Error(`Duplicate FeatureOutlet placement for '${declaration.field}'`);
  const token=this.authority.create(()=>this.changed());const tokens=this.claims.get(view)??new Set<PlacementPresence>();tokens.add(token);this.claims.set(view,tokens);this.changed();
  return Object.assign(()=>{if(!tokens.delete(token))return;token.release();if(!tokens.size)this.claims.delete(view);this.changed();},{acknowledge:()=>token.acknowledge()});
 }
 validate(){
  if(this.disposed)return;
  const dynamic=this.activated||this.registry?.isAttached;
  for(const [view,tokens] of this.claims)if([...tokens].filter(token=>!dynamic||token.live).length>1)throw new Error(`Duplicate FeatureOutlet placement for '${this.declarations.get(view)!.field}'`);
  // A paused outro still owns its placement until release; it is not a missing outlet.
  for(const [view,{field,required}] of this.declarations)if(required&&!this.claims.has(view))throw new Error(`Missing FeatureOutlet placement for '${field}'; declare headless explicitly if it has no view`);
 }
 verify(){if(this.registry?.isAttached||this.activated){this.changed();return;}this.validate();}
 activate(){this.activated=true;this.changed();}
 private changed(){
  if(this.disposed)return;
  if(this.registry){this.registry.requestPlacementValidation();return;}
  const group=this.group;if(!group||group.pending)return;group.pending=true;
  const finish=()=>{
   group.pending=false;
   const live=[...group.scopes].filter(scope=>scope.activated&&scope.presence.live);
   if(live.length>1){for(const scope of live.slice(1))scope.dispose();console.error('[Composable Svelte] Invalid borrowed rendering layout:',new Error('Duplicate rendering layout for one feature owner'));}
   for(const scope of live){if(scope.disposed)continue;try{scope.validate();}catch(error){scope.dispose();console.error('[Composable Svelte] Invalid borrowed rendering layout:',error);}}
  };
  void tick().then(()=>{
   if(!group.scopes.size){group.pending=false;return;}
   if(group.scopes.size>1||[...group.scopes].some(scope=>scope.contested())){group.activity.challenge();return tick().then(()=>{group.activity.settle();finish();});}
   return finish();
  }).catch(error=>{group.pending=false;this.dispose();console.error('[Composable Svelte] Invalid borrowed rendering layout:',error);[...group.scopes].find(scope=>scope.activated)?.changed();});
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.active=false;this.unregister();this.presence.release();for(const tokens of this.claims.values())for(const token of tokens)token.release();this.claims.clear();}
}
