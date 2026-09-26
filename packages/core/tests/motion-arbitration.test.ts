// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {tick} from 'svelte';
import {createStore} from '../src/lib/store.svelte.js';
import {integrate} from '../src/lib/navigation/integrate.js';
import {optionalSlot} from '../src/lib/navigation/managed-integration.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer} from '../src/lib/types.js';
import type {PresentationAction} from '../src/lib/navigation/types.js';
import {targetFor,captureHasPropertyAuthority} from '../src/lib/application/renderer/target-registry.js';
import {rendererOwner} from '../src/lib/application/renderer/owner.js';
import {PropertyAuthority} from '../src/lib/application/renderer/property-leases.js';
import type {MotionRunContext} from '../src/lib/application/renderer/motion-run.js';
type S={child:{value:number}|null};type CA={type:'increment'};type A={type:'child';action:PresentationAction<CA>}|{type:'remove'};
const slot=optionalSlot<S,A>()('child');const reducer:Reducer<S,A>=(s,a)=>[a.type==='remove'?{child:null}:s,Effect.none()];const child:Reducer<{value:number},CA>=s=>[{value:s.value+1},Effect.none()];const composition=integrate(reducer).managed().with(slot,child).build();
function setup(){const store=createStore({initialState:{child:{value:0}},...composition});const claim=rendererOwner(store,composition.execution).claim();claim.attach();return{store,claim,registry:claim.registry,node:document.createElement('div')};}
function target(node:HTMLElement,name='surface',properties:readonly ('opacity'|'transform')[]=['opacity']){return{name,node,properties,stable:{opacity:'0.5',transform:'none'}};}
it('root binding needs no synthetic child slot and host release ends its record',async()=>{const a=setup();const binding=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:0});expect(a.node.style.opacity).toBe('0.5');let context!:MotionRunContext;const run=binding.start({deadlineMs:1000,stable(){},execute(c){context=c;return new Promise(()=>{});}});a.claim.release();expect(binding.live).toBe(false);expect(context.live).toBe(false);expect((await run.settled).outcome.status).toBe('disposed');a.store.destroy();});
it('logical child retirement cancels micro resources synchronously',async()=>{const a=setup();const view=composition.bind(a.store,slot)!;const binding=a.registry.bind(a.registry.ownerFor(view),[target(a.node)],{channel:'micro',priority:0});let context!:MotionRunContext;const cleanup=vi.fn();const run=binding.start({deadlineMs:1000,stable(){},execute(c){context=c;const lease=binding.lease('surface','opacity',c,cleanup);lease.write('0.8');return new Promise(()=>{});}});a.store.dispatch({type:'remove'});expect(binding.live).toBe(false);expect(context.live).toBe(false);expect(cleanup).toHaveBeenCalledTimes(1);expect((await run.settled).outcome.status).toBe('disposed');expect(()=>a.registry.ownerFor(view)).toThrow('retired');a.store.destroy();});
it('independent properties coexist while required property theft supersedes the exact whole group',async()=>{const a=setup();const first=a.registry.bind(a.registry.rootOwner,[target(a.node,'surface',['opacity','transform'])],{channel:'macro',priority:0});let context!:MotionRunContext;const run=first.start({deadlineMs:1000,stable(){},execute(c){context=c;first.lease('surface','opacity',c).write('0.8');first.lease('surface','transform',c).write('scale(2)');return new Promise(()=>{});}});const next=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:1});expect(first.live).toBe(false);expect(context.live).toBe(false);expect((await run.settled).outcome.status).toBe('superseded');first.stable('surface',{opacity:'0.1'});expect(a.node.style.opacity).toBe('0.5');next.stable('surface',{opacity:'0.9'});expect(a.node.style.opacity).toBe('0.9');a.store.destroy();});
it('same-node distinct property groups coexist and latest stable survives temporary writes',async()=>{const a=setup();const opacity=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'opacity',priority:0});const transform=a.registry.bind(a.registry.rootOwner,[target(a.node,'surface',['transform'])],{channel:'transform',priority:0});let complete!:()=>void;const run=opacity.start({deadlineMs:1000,stable(){},execute(c){opacity.lease('surface','opacity',c).write('0.2');return new Promise<void>(resolve=>complete=resolve);}});opacity.stable('surface',{opacity:'0.9'});transform.stable('surface',{transform:'scale(2)'});expect(a.node.style.opacity).toBe('0.2');expect(a.node.style.transform).toBe('scale(2)');complete();await run.settled;expect(a.node.style.opacity).toBe('0.9');a.store.destroy();});
it('invalid cross-channel tie and lower priority reject without partial writes or replacing incumbent',()=>{const a=setup();const first=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'macro',priority:2});const other=document.createElement('div');expect(()=>a.registry.bind(a.registry.rootOwner,[target(other,'other'),target(a.node)],{channel:'micro',priority:2})).toThrow('Conflicting');expect(first.live).toBe(true);expect(other.style.opacity).toBe('');expect(a.registry.size).toBe(1);expect(()=>a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'macro',priority:1})).toThrow('Conflicting');first.stable('surface',{opacity:'0.7'});expect(a.node.style.opacity).toBe('0.7');expect(a.registry.diagnostics).toHaveLength(2);a.store.destroy();});
it('reentrant old cleanup preserves a newer successor over the interrupted replacement',()=>{const a=setup();const owner=a.registry.rootOwner;const first=a.registry.bind(owner,[target(a.node)],{channel:'same',priority:0});let newest:ReturnType<typeof a.registry.bind>|undefined;first.start({deadlineMs:1000,stable(){},execute(c){first.lease('surface','opacity',c,()=>{newest=a.registry.bind(owner,[{...target(a.node),stable:{opacity:'0.95'}}],{channel:'same',priority:0});});return new Promise(()=>{});}});const interrupted=a.registry.bind(owner,[{...target(a.node),stable:{opacity:'0.6'}}],{channel:'same',priority:0});expect(interrupted.live).toBe(false);expect(newest?.live).toBe(true);expect(a.node.style.opacity).toBe('0.95');interrupted.release();expect(a.node.style.opacity).toBe('0.95');a.store.destroy();});
it('cross-root capability and node rejection leave no partially acquired resources',()=>{const a=setup(),b=setup();const count=b.registry.size;expect(()=>b.registry.bind(a.registry.rootOwner,[target(b.node)],{channel:'same',priority:0})).toThrow('foreign');a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'same',priority:0});expect(()=>b.registry.bind(b.registry.rootOwner,[target(b.node,'first'),target(a.node)],{channel:'same',priority:0})).toThrow('another root');expect(b.registry.size).toBe(count);expect(b.node.style.opacity).toBe('');a.store.destroy();b.store.destroy();});
it('group validation reads all projections before disturbing active authority',()=>{const writes:string[]=[];const authority=new PropertyAuthority((_p,v)=>writes.push(v));const first=PropertyAuthority.claimGroup([{authority,properties:['opacity'],stable:{opacity:'0.4'}}],{channel:'same',priority:0,onSuperseded(){}});expect(()=>PropertyAuthority.claimGroup([{authority,properties:['opacity','transform'],stable:{opacity:'0.8',get transform():string{throw new Error('projection');}}}],{channel:'same',priority:0,onSuperseded(){}})).toThrow('projection');expect(first.live).toBe(true);expect(writes).toEqual(['0.4']);first.release();authority.dispose();});

it('component release before host attachment never writes or starts playback',()=>{const store=createStore({initialState:{child:{value:0}},...composition});const claim=rendererOwner(store,composition.execution).claim();const node=document.createElement('div');const binding=claim.registry.bind(claim.registry.rootOwner,[target(node)],{channel:'micro',priority:0});expect(node.style.opacity).toBe('');binding.release();claim.attach();expect(node.style.opacity).toBe('');expect(binding.live).toBe(false);expect(claim.registry.size).toBe(0);store.destroy();});
it('foreign run context cannot acquire another binding property',()=>{const a=setup();const one=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'one',priority:0});const two=a.registry.bind(a.registry.rootOwner,[target(document.createElement('div'))],{channel:'two',priority:0});let foreign!:MotionRunContext;two.start({deadlineMs:1000,stable(){},execute(c){foreign=c;return new Promise(()=>{});}});expect(()=>one.lease('surface','opacity',foreign)).toThrow('live motion binding');expect(a.node.style.opacity).toBe('0.5');a.store.destroy();});
it('bounded conflicts never retain an unbounded diagnostic history or failed records',()=>{const a=setup();a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'first',priority:1});for(let i=0;i<50;i++)expect(()=>a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'other',priority:1})).toThrow('Conflicting');expect(a.registry.diagnostics).toHaveLength(32);expect(a.registry.size).toBe(1);a.store.destroy();});
it('partially failing group activation rolls back every claimed address',()=>{const writes:string[]=[];let reject=true;const first=new PropertyAuthority((_p,v)=>writes.push(v));const second=new PropertyAuthority(()=>{if(reject)throw new Error('write');});const targets=[{authority:first,properties:['opacity'] as const,stable:{opacity:'0.4'}},{authority:second,properties:['opacity'] as const,stable:{opacity:'0.5'}}];expect(()=>PropertyAuthority.claimGroup(targets,{channel:'same',priority:0,onSuperseded(){}})).toThrow('write');reject=false;const next=PropertyAuthority.claimGroup(targets,{channel:'different',priority:0,onSuperseded(){}});expect(next.live).toBe(true);next.release();first.dispose();second.dispose();});
it('legacy alias writes cannot bypass an accepted managed stable binding',()=>{const a=setup();const view=composition.bind(a.store,slot)!;const legacy=a.registry.register(view,targetFor(slot,['opacity']),a.node,{opacity:'0.2'});const binding=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:0});legacy.stable({opacity:'0.1'});expect(a.node.style.opacity).toBe('0.5');expect(()=>legacy.lease('opacity')).toThrow('managed binding');binding.stable('surface',{opacity:'0.7'});expect(a.node.style.opacity).toBe('0.7');a.store.destroy();});

import type {MotionPlan} from '../src/lib/application/renderer/motion-run.js';
function countedPlan(values:Partial<Record<keyof MotionPlan,unknown>>){
  const fields:Record<keyof MotionPlan,unknown>={deadlineMs:1000,execute:()=>new Promise<void>(()=>{}),stable(){},skip:undefined,complete:undefined,...values};
  const reads={deadlineMs:0,execute:0,stable:0,skip:0,complete:0};
  const plan={
    get deadlineMs(){reads.deadlineMs++;return fields.deadlineMs;},
    get execute(){reads.execute++;return fields.execute;},
    get stable(){reads.stable++;return fields.stable;},
    get skip(){reads.skip++;return fields.skip;},
    get complete(){reads.complete++;return fields.complete;}
  } as unknown as MotionPlan;
  return {plan,reads};
}
it('start reads every plan getter once and rejects malformed plans before superseding the incumbent',async()=>{
  const a=setup();const binding=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:0});
  let incumbentContext!:MotionRunContext;const incumbentStable=vi.fn(),fallback=vi.fn();
  const incumbent=binding.start({deadlineMs:1000,stable:incumbentStable,execute(c){incumbentContext=c;binding.lease('surface','opacity',c).write('0.8');return new Promise(()=>{});}});
  const malformed:[Partial<Record<keyof MotionPlan,unknown>>,ErrorConstructor][]=[
    [{execute:undefined},TypeError],[{execute:'not-a-function'},TypeError],[{stable:undefined},TypeError],
    [{deadlineMs:Number.NaN},RangeError],[{deadlineMs:-1},RangeError],[{deadlineMs:Infinity},RangeError],[{deadlineMs:'1000'},RangeError],
    [{skip:'disabled',complete:true},TypeError]
  ];
  for(const [fields,error] of malformed){
    const {plan,reads}=countedPlan({stable:fallback,...fields});
    expect(()=>binding.start(plan)).toThrow(error);
    expect(reads).toEqual({deadlineMs:1,execute:1,stable:1,skip:1,complete:1});
    expect(incumbent.live).toBe(true);expect(incumbentContext.live).toBe(true);expect(a.node.style.opacity).toBe('0.8');
  }
  expect(()=>binding.start({deadlineMs:1000,stable:fallback,get execute():never{throw new Error('getter');}})).toThrow('getter');
  expect(incumbent.live).toBe(true);expect(fallback).not.toHaveBeenCalled();expect(incumbentStable).not.toHaveBeenCalled();
  let nextContext!:MotionRunContext,receiver:unknown;
  const valid=countedPlan({execute(this:unknown,c:MotionRunContext){receiver=this;nextContext=c;return new Promise<void>(()=>{});}});
  const next=binding.start(valid.plan);
  expect(valid.reads).toEqual({deadlineMs:1,execute:1,stable:1,skip:1,complete:1});expect(receiver).toBe(valid.plan);
  expect((await incumbent.settled).outcome.status).toBe('superseded');expect(next.live).toBe(true);
  // The captured execute still enrolls its run context for leases.
  binding.lease('surface','opacity',nextContext).write('0.3');expect(a.node.style.opacity).toBe('0.3');
  const skippedExecute=vi.fn(),skippedStable=vi.fn();
  const skipped=countedPlan({execute:skippedExecute,stable:skippedStable,skip:'disabled'});
  expect((await binding.start(skipped.plan).settled).outcome).toEqual({status:'skipped',reason:'disabled'});
  expect(skipped.reads).toEqual({deadlineMs:1,execute:1,stable:1,skip:1,complete:1});
  expect(skippedExecute).not.toHaveBeenCalled();expect(skippedStable).toHaveBeenCalledTimes(1);expect(fallback).not.toHaveBeenCalled();
  a.store.destroy();
});
it('legacy alias projections are tracked per registration and the latest live one returns when a managed group retires',()=>{
  const a=setup();const view=composition.bind(a.store,slot)!;
  const bind=(opacity:string,priority=0)=>a.registry.bind(a.registry.rootOwner,[{...target(a.node),stable:{opacity}}],{channel:'managed',priority});
  const older=a.registry.register(view,targetFor(slot,['opacity']),a.node,{opacity:'0.2'});
  const newer=a.registry.register(view,targetFor(slot,['opacity']),a.node,{opacity:'0.3'});
  expect(a.node.style.opacity).toBe('0.3');
  const first=bind('0.5');expect(a.node.style.opacity).toBe('0.5');
  // Updates under managed ownership are remembered per alias without writing through.
  newer.stable({opacity:'0.35'});older.stable({opacity:'0.25'});expect(a.node.style.opacity).toBe('0.5');
  // Successor transfer: a superseded predecessor never restores over its successor.
  const second=bind('0.9',1);expect(first.live).toBe(false);expect(a.node.style.opacity).toBe('0.9');
  first.release();expect(a.node.style.opacity).toBe('0.9');
  second.release();expect(a.node.style.opacity).toBe('0.25');
  // Releasing the latest alias removes only its own contribution.
  const third=bind('0.5');older.release();expect(a.node.style.opacity).toBe('0.5');
  third.release();expect(a.node.style.opacity).toBe('0.35');
  // Releasing an older alias neither erases nor replaces the latest projection.
  const extra=a.registry.register(view,targetFor(slot,['opacity']),a.node,{opacity:'0.6'});expect(a.node.style.opacity).toBe('0.6');
  const fourth=bind('0.5');newer.stable({opacity:'0.45'});extra.release();expect(a.node.style.opacity).toBe('0.5');
  fourth.release();expect(a.node.style.opacity).toBe('0.45');
  // No live legacy projection remains: retirement keeps the current no-base behavior.
  const fifth=bind('0.5');newer.release();fifth.release();
  expect(a.node.style.opacity).toBe('0.5');expect(a.registry.size).toBe(0);
  a.store.destroy();
});
it('property authority restores the latest remaining legacy contribution with one write and none when nothing remains',()=>{
  const writes:string[]=[];const authority=new PropertyAuthority((_p,v)=>writes.push(v));const one={},two={};
  const claim=()=>PropertyAuthority.claimGroup([{authority,properties:['opacity'],stable:{opacity:'0.5'}}],{channel:'same',priority:0,onSuperseded(){}});
  authority.stable('opacity','0.2',one);authority.stable('opacity','0.3',two);
  const group=claim();authority.stable('opacity','0.25',one);
  expect(writes).toEqual(['0.2','0.3','0.5']);
  group.lease(0,'opacity',()=>true).write('0.9');authority.withdraw(one);group.release();
  expect(writes).toEqual(['0.2','0.3','0.5','0.9','0.3']);
  const next=claim();authority.withdraw(two);next.release();
  expect(writes).toEqual(['0.2','0.3','0.5','0.9','0.3','0.5']);
  authority.dispose();
});
it('bind reads target and policy getters exactly once, including across deferred attachment',()=>{
  const a=setup();const size=a.registry.size;
  const reads={channel:0,priority:0,name:0,node:0,properties:0,stable:0};
  const binding=a.registry.bind(a.registry.rootOwner,[{
    get name(){reads.name++;return 'surface';},
    get node(){reads.node++;return a.node;},
    get properties(){reads.properties++;return ['opacity'] as const;},
    get stable(){reads.stable++;return {opacity:'0.5'};}
  }],{get channel(){reads.channel++;return 'snapshot';},get priority(){reads.priority++;return 0;}});
  expect(reads).toEqual({channel:1,priority:1,name:1,node:1,properties:1,stable:1});
  expect(binding.live).toBe(true);expect(a.node.style.opacity).toBe('0.5');expect(a.registry.size).toBe(size+1);
  // A name that changes between reads can no longer slip past the uniqueness check.
  let hostileReads=0;const other=document.createElement('div');
  expect(()=>a.registry.bind(a.registry.rootOwner,[target(document.createElement('div')),{get name(){return ++hostileReads===1?'surface':'other';},node:other,properties:['opacity'],stable:{opacity:'0.5'}}],{channel:'hostile',priority:0})).toThrow('Duplicate or empty binding target name');
  expect(hostileReads).toBe(1);expect(other.style.opacity).toBe('');expect(a.registry.size).toBe(size+1);
  // Deferred attachment claims with the captured policy instead of reading it again.
  const store=createStore({initialState:{child:{value:0}},...composition});const claim=rendererOwner(store,composition.execution).claim();
  let policyReads=0;const deferredNode=document.createElement('div');
  const deferred=claim.registry.bind(claim.registry.rootOwner,[target(deferredNode)],{get channel(){policyReads++;return 'deferred';},get priority(){policyReads++;return 0;}});
  claim.attach();
  expect(policyReads).toBe(2);expect(deferred.live).toBe(true);expect(deferredNode.style.opacity).toBe('0.5');
  store.destroy();a.store.destroy();
});
it('bind rejects missing or non-element nodes before reserving a record or endangering a later attach',()=>{
  const a=setup();const size=a.registry.size;
  for(const invalid of [undefined,null,{},{nodeType:3},{nodeType:1},{nodeType:1,style:{}},{nodeType:1,style:{setProperty(){}}},'div',123]){
    expect(()=>a.registry.bind(a.registry.rootOwner,[{name:'surface',node:invalid as never,properties:['opacity'],stable:{opacity:'0.5'}}],{channel:'invalid',priority:0})).toThrow(TypeError);
    expect(a.registry.size).toBe(size);
  }
  const store=createStore({initialState:{child:{value:0}},...composition});const claim=rendererOwner(store,composition.execution).claim();
  expect(()=>claim.registry.bind(claim.registry.rootOwner,[{name:'surface',node:null as never,properties:['opacity'],stable:{opacity:'0.5'}}],{channel:'invalid',priority:0})).toThrow(TypeError);
  expect(claim.registry.size).toBe(0);claim.attach();expect(claim.live).toBe(true);
  store.destroy();a.store.destroy();
});

import {normalizeMotionValue} from '../src/lib/application/motion/properties.js';
it('one arbitration protocol accepts compiler-normalized size, color and declared numeric channels',async()=>{const a=setup();const stable={width:normalizeMotionValue('width',{value:12,unit:'rem'}).css,color:normalizeMotionValue('color','#123456').css,'--progress':normalizeMotionValue('--progress',0.4,{'--progress':{unit:'number',interpolation:'number'}}).css};const binding=a.registry.bind(a.registry.rootOwner,[{name:'surface',node:a.node,properties:['width','color','--progress'],stable}],{channel:'visual',priority:0});expect(a.node.style.width).toBe('12rem');expect(a.node.style.color).toBe('rgb(18, 52, 86)');expect(a.node.style.getPropertyValue('--progress')).toBe('0.4');let complete!:()=>void;const run=binding.start({deadlineMs:1000,stable(){},execute(c){binding.lease('surface','width',c).write('5rem');binding.lease('surface','--progress',c).write('0.6');return new Promise<void>(done=>complete=done);}});binding.stable('surface',{width:'14rem','--progress':'1'});expect(a.node.style.width).toBe('5rem');complete();await run.settled;expect(a.node.style.width).toBe('14rem');expect(a.node.style.getPropertyValue('--progress')).toBe('1');a.store.destroy();});

it('pre-attach cross-channel equal-priority conflict rejects newcomer without destroying host or incumbent',()=>{const store=createStore({initialState:{child:{value:0}},...composition});const claim=rendererOwner(store,composition.execution).claim();const node=document.createElement('div');const first=claim.registry.bind(claim.registry.rootOwner,[target(node)],{channel:'macro',priority:0});const second=claim.registry.bind(claim.registry.rootOwner,[target(node)],{channel:'micro',priority:0});expect(node.style.opacity).toBe('');claim.attach();expect(claim.live).toBe(true);expect(first.live).toBe(true);expect(second.live).toBe(false);expect(node.style.opacity).toBe('0.5');expect(claim.registry.size).toBe(1);expect(claim.registry.diagnostics).toHaveLength(1);expect(claim.registry.diagnostics[0]).toEqual({kind:'rejected',channel:'micro',incumbent:'macro'});store.destroy();});
it('managed binding retirement with active lease marks node so captureHasPropertyAuthority remains true immediately and false after tick',async()=>{const a=setup();const binding=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:0});let context!:MotionRunContext;binding.start({deadlineMs:1000,stable(){},execute(c){context=c;binding.lease('surface','opacity',c).write('0.8');return new Promise(()=>{});}});expect(a.node.style.opacity).toBe('0.8');expect(captureHasPropertyAuthority(a.node)).toBe(true);binding.release();expect(binding.live).toBe(false);expect(context.live).toBe(false);expect(a.node.style.opacity).toBe('0.5');expect(captureHasPropertyAuthority(a.node)).toBe(true);await tick();expect(captureHasPropertyAuthority(a.node)).toBe(false);a.store.destroy();});
it('managed binding retirement without an active lease never marks its node',async()=>{const a=setup();const idle=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'idle',priority:0});idle.release();expect(captureHasPropertyAuthority(a.node)).toBe(false);const other=document.createElement('div');const binding=a.registry.bind(a.registry.rootOwner,[target(other)],{channel:'micro',priority:0});let complete!:()=>void;const run=binding.start({deadlineMs:1000,stable(){},execute(c){binding.lease('surface','opacity',c).write('0.8');return new Promise<void>(done=>complete=done);}});expect(captureHasPropertyAuthority(other)).toBe(true);complete();expect((await run.settled).outcome.status).toBe('completed');expect(captureHasPropertyAuthority(other)).toBe(false);binding.release();expect(binding.live).toBe(false);expect(captureHasPropertyAuthority(other)).toBe(false);a.store.destroy();});

it('complete binding plan settles synchronously completed, creates zero leases, and releases incumbent leases',async()=>{
  const a=setup();const binding=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:0});
  let incumbentContext!:MotionRunContext;const incumbentCleanup=vi.fn();
  const incumbent=binding.start({
    deadlineMs:1000,
    execute(c){incumbentContext=c;const lease=binding.lease('surface','opacity',c,incumbentCleanup);lease.write('0.8');return new Promise(()=>{});},
    stable(){}
  });
  expect(a.node.style.opacity).toBe('0.8');
  expect(incumbent.live).toBe(true);
  const completeExecute=vi.fn(),completeStable=vi.fn();
  const complete=countedPlan({execute:completeExecute,stable:completeStable,complete:true});
  let receipt:any;
  const run=binding.start(complete.plan);
  void run.settled.then(r=>{receipt=r;});
  await Promise.resolve();
  expect(complete.reads).toEqual({deadlineMs:1,execute:1,stable:1,skip:1,complete:1});
  expect(receipt.outcome).toEqual({status:'completed'});
  expect(completeExecute).not.toHaveBeenCalled();
  expect(completeStable).toHaveBeenCalledTimes(1);
  expect(incumbentCleanup).toHaveBeenCalledTimes(1);
  expect((await incumbent.settled).outcome.status).toBe('superseded');
  expect(a.node.style.opacity).toBe('0.5');
  a.store.destroy();
});

it('complete binding plan remains completed under reduced document without preference watch while playable plan reduces',async()=>{
  const a=setup();const binding=a.registry.bind(a.registry.rootOwner,[target(a.node)],{channel:'micro',priority:0});
  vi.spyOn(a.registry.preferences,'reduced').mockReturnValue(true);
  const watchSpy=vi.spyOn(a.registry.preferences,'watch');

  const completeExecute=vi.fn();
  const complete=countedPlan({execute:completeExecute,stable(){},complete:true});
  const completeRun=binding.start(complete.plan);
  expect((await completeRun.settled).outcome).toEqual({status:'completed'});
  expect(completeExecute).not.toHaveBeenCalled();
  expect(watchSpy).not.toHaveBeenCalled();

  const disabled=countedPlan({skip:'disabled',execute(){},stable(){}});
  expect((await binding.start(disabled.plan).settled).outcome).toEqual({status:'skipped',reason:'disabled'});

  const playable=countedPlan({execute(){},stable(){}});
  expect((await binding.start(playable.plan).settled).outcome).toEqual({status:'skipped',reason:'reducedMotion'});

  a.store.destroy();
});
