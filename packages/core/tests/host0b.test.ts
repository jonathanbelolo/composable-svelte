import {it,expect,vi} from 'vitest';
import {expectConsole} from './helpers/console.js';
import {integrate} from '../src/lib/navigation/integrate.js';
import {optionalSlot} from '../src/lib/navigation/managed-integration.js';
import {createStore} from '../src/lib/store.svelte.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer} from '../src/lib/types.js';
import type {PresentationAction} from '../src/lib/navigation/types.js';
import {rendererOwner} from '../src/lib/application/renderer/owner.js';
import {TargetRegistry,targetFor} from '../src/lib/application/renderer/target-registry.js';
import {PropertyAuthority,type PropertyLease} from '../src/lib/application/renderer/property-leases.js';
import {createMotionClock,type MotionRunContext} from '../src/lib/application/renderer/motion-run.js';
import {CaptureChannel} from '../src/lib/application/renderer/capture-channel.js';
import {createDeterministicScheduler,type ExecutionScheduler,type TimerHandle} from '../src/lib/execution/scheduler.js';
type C={value:number};type CA={type:'increment'};type S={child:C|null};type A={type:'child';action:PresentationAction<CA>}|{type:'remove'}|{type:'replace'};
const slot=optionalSlot<S,A>()('child');
const child:Reducer<C,CA>=s=>[{value:s.value+1},Effect.none()];
const core:Reducer<S,A>=(s,a)=>[a.type==='remove'?{child:null}:a.type==='replace'?{child:{value:0}}:s,Effect.none()];
const definition=integrate(core).managed().with(slot,child,{replaceOn:a=>a.type==='replace'}).build();
function fixture(){const store=createStore({initialState:{child:{value:0}},...definition});return {store,owner:rendererOwner(store,definition.execution),view:definition.bind(store,slot)!};}
const target=targetFor(slot,['opacity','transform']);const pose={opacity:'.3',transform:'scale(1)'};
it('registers before attachment without DOM writes, activates pending and dynamic targets once',async()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();const node=document.createElement('div');
 const h=claim.registry.register(view,target,node,pose);expect(node.style.opacity).toBe('');expect(claim.registry.size).toBe(1);
 claim.attach();claim.attach();expect(node.style.opacity).toBe('0.3');
 const other=document.createElement('div');const second=claim.registry.register(view,targetFor(slot,['opacity']),other,{opacity:'.6'});expect(other.style.opacity).toBe('0.6');
 h.release();second.release();expect(claim.registry.size).toBe(0);store.destroy();await store._runtime!.resourceScope.whenCleanupsSettled();expect(store._runtime!.pendingWorkCount).toBe(0);
});
it('retirement before attach never activates and stale view cannot bind replacement',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();const node=document.createElement('div');const h=claim.registry.register(view,target,node,pose);
 store.dispatch({type:'replace'});claim.attach();expect(h.live).toBe(false);expect(node.style.opacity).toBe('');expect(claim.registry.size).toBe(0);
 expect(()=>claim.registry.register(view,target,node,pose)).toThrow('retired');const next=definition.bind(store,slot)!;expect(claim.registry.register(next,target,node,pose).live).toBe(true);store.destroy();expect(claim.registry.size).toBe(0);
});
it('rejects duplicate hosts before mount and obsolete releases do not detach successor',()=>{
 const {store,owner}=fixture();const old=owner.claim();expect(()=>rendererOwner(store,definition.execution).claim()).toThrow('already');old.release();const next=owner.claim();old.release();expect(next.live).toBe(true);next.attach();store.destroy();expect(next.live).toBe(false);expect(()=>owner.claim()).toThrow('destroyed');
});
it('rejects foreign roots and duplicate scoped addresses without resource leaks',()=>{
 const a=fixture(),b=fixture();const claim=a.owner.claim();const node=document.createElement('div');const n=a.store._runtime!.resourceScope.size;
 expect(()=>claim.registry.register(b.view,target,node,pose)).toThrow('root');expect(a.store._runtime!.resourceScope.size).toBe(n);
 claim.registry.register(a.view,target,node,pose);expect(()=>claim.registry.register(a.view,target,node,pose)).toThrow('Duplicate');a.store.destroy();b.store.destroy();
});
it('rejects cross-root node ownership on attach and releases failed host claim',()=>{
 const a=fixture(),b=fixture();const one=a.owner.claim(),two=b.owner.claim();const node=document.createElement('div');one.registry.register(a.view,target,node,pose);two.registry.register(b.view,target,node,pose);one.attach();expect(()=>two.attach()).toThrow('another root');expect(two.live).toBe(false);expect(two.registry.size).toBe(0);expect(b.owner.claim().live).toBe(true);a.store.destroy();b.store.destroy();
});
it('aliases share property authority, independent channels coexist and latest stable wins',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();claim.attach();const node=document.createElement('div');const a=claim.registry.register(view,target,node,pose);const b=claim.registry.register(view,targetFor(slot,['opacity']),node,{opacity:'.5'});
 const opacity=a.lease('opacity');opacity.write('.8');const transform=a.lease('transform');transform.write('scale(2)');b.stable({opacity:'.2'});expect(node.style.opacity).toBe('0.8');const successor=b.lease('opacity');expect(opacity.live).toBe(false);successor.write('.9');opacity.release();expect(node.style.opacity).toBe('0.9');successor.release();expect(node.style.opacity).toBe('0.2');expect(transform.live).toBe(true);store.destroy();expect(transform.live).toBe(false);
});
it('reentrant predecessor cleanup can replace requested successor without losing newest authority',()=>{
 const writes:string[]=[];const authority=new PropertyAuthority((_p,v)=>writes.push(v));authority.stable('opacity','stable');let newest!:PropertyLease;
 const old=authority.lease('opacity',()=>true,()=>{newest=authority.lease('opacity',()=>true);newest.write('newest');});old.write('old');
 const requested=authority.lease('opacity',()=>true);requested.write('must-not-write');expect(requested.live).toBe(false);expect(newest.live).toBe(true);expect(writes.at(-1)).toBe('newest');authority.stable('opacity','latest');newest.release();expect(writes.at(-1)).toBe('latest');authority.dispose();
});
it('owner removal retires property authority before retained handles can write',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();claim.attach();const node=document.createElement('div');const h=claim.registry.register(view,target,node,pose);const lease=h.lease('opacity');lease.write('.8');store.dispatch({type:'remove'});expect(h.live).toBe(false);const stable=node.style.opacity;lease.write('.9');h.stable({...pose,opacity:'.1'});expect(node.style.opacity).toBe(stable);expect(()=>h.lease('opacity')).toThrow('live');store.destroy();
});

it('throwing predecessor cleanup does not orphan a live successor',()=>{
 const errors:unknown[]=[];const values:string[]=[];const authority=new PropertyAuthority((_p,v)=>values.push(v),error=>{errors.push(error);throw new Error('diagnostic');});
 authority.stable('opacity','stable');authority.lease('opacity',()=>true,()=>{throw new Error('cleanup');});const successor=authority.lease('opacity',()=>true);successor.write('new');expect(values.at(-1)).toBe('new');expect(errors).toHaveLength(1);successor.release();authority.dispose();
});

import {keyedSlot} from '../src/lib/navigation/managed-integration.js';
it('keyed targets preserve signed zero owners and replacement isolation',()=>{
 type Rows={rows:{id:number;state:C}[]};type RA={type:'rows';id:number;action:CA}|{type:'removeNegative'};
 const rows=keyedSlot<Rows,RA>()('rows');const reduce:Reducer<Rows,RA>=(s,a)=>[a.type==='removeNegative'?{rows:s.rows.filter(row=>!Object.is(row.id,-0))}:s,Effect.none()];
 const composed=integrate(reduce).managed().forEach(rows,child).build();const store=createStore({initialState:{rows:[{id:-0,state:{value:0}},{id:0,state:{value:0}}]},...composed});const claim=rendererOwner(store,composed.execution).claim();claim.attach();
 const negative=rows.at(-0),positive=rows.at(0);const neg=claim.registry.register(composed.bind(store,rows.at(-0))!,targetFor(negative,['opacity']),document.createElement('div'),{opacity:'0.2'});const pos=claim.registry.register(composed.bind(store,positive)!,targetFor(positive,['opacity']),document.createElement('div'),{opacity:'0.8'});
 store.dispatch({type:'removeNegative'});expect(neg.live).toBe(false);expect(pos.live).toBe(true);expect(claim.registry.size).toBe(1);store.destroy();
});
it('cleanup failure cannot prevent other owned targets from retiring',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();claim.attach();const first=claim.registry.register(view,target,document.createElement('div'),pose);const second=claim.registry.register(view,targetFor(slot,['opacity']),document.createElement('div'),{opacity:'0.5'});
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});first.lease('opacity',()=>{throw new Error('dispose');});second.lease('opacity');store.dispatch({type:'remove'});expect(first.live).toBe(false);expect(second.live).toBe(false);expect(claim.registry.size).toBe(0);expect(log).toHaveBeenCalled();store.destroy();log.mockRestore();
});

it('same-shaped foreign slot lineage cannot bind a managed target',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();const foreign=optionalSlot<S,A>()('child');
 expect(()=>claim.registry.register(view,targetFor(foreign,['opacity']),document.createElement('div'),{opacity:'0.5'})).toThrow('slot/root');expect(claim.registry.size).toBe(0);store.destroy();
});

it('node adoption does not bypass cross-root ownership and cleanup allows its later reuse',()=>{
 const a=fixture(),b=fixture();const one=a.owner.claim(),two=b.owner.claim();one.attach();two.attach();const node=document.createElement('div');one.registry.register(a.view,target,node,pose);
 const foreign=document.implementation.createHTMLDocument('adopted');foreign.adoptNode(node);
 expect(()=>two.registry.register(b.view,target,node,pose)).toThrow('another root');a.store.destroy();expect(two.registry.register(b.view,target,node,pose).live).toBe(true);b.store.destroy();
});
it('lease cleanup rejection is tracked through the root ResourceScope and cannot steal successor',async()=>{
 expectConsole('error');
 const {store,owner,view}=fixture();const claim=owner.claim();claim.attach();const node=document.createElement('div');const handle=claim.registry.register(view,target,node,pose);let reject!: (error:Error)=>void;
 handle.lease('opacity',()=>new Promise<void>((_resolve,no)=>{reject=no;}));const next=handle.lease('opacity');next.write('0.7');
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);reject(new Error('lease rejection'));await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.diagnostics.some(event=>event.type==='failure'&&event.phase==='cleanup')).toBe(true);expect(next.live).toBe(true);expect(node.style.opacity).toBe('0.7');store.destroy();await store._runtime!.whenCleanupsSettled();
});
it('throwing initial projection cannot leak a resource and reentrant retirement cannot enroll a target',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();const node=document.createElement('div');const count=store._runtime!.resourceScope.size;
 expect(()=>claim.registry.register(view,target,node,{get opacity():string{throw new Error('projection');},transform:'none'})).toThrow('projection');expect(store._runtime!.resourceScope.size).toBe(count);
 expect(()=>claim.registry.register(view,target,node,{get opacity(){store.dispatch({type:'remove'});return '0.5';},transform:'none'})).toThrow('retired');expect(claim.registry.size).toBe(0);store.destroy();
});
it('reentrant projection evaluation cannot install two registrations for one scoped address',()=>{
 const {store,owner,view}=fixture();const claim=owner.claim();const node=document.createElement('div');
 expect(()=>claim.registry.register(view,target,node,{get opacity(){claim.registry.register(view,target,node,pose);return '0.5';},transform:'none'})).toThrow('Duplicate');expect(claim.registry.size).toBe(1);store.destroy();
});
it('root destruction retains observation of an already pending rejected lease cleanup',async()=>{
 expectConsole('error');const {store,owner,view}=fixture();const claim=owner.claim();claim.attach();const handle=claim.registry.register(view,target,document.createElement('div'),pose);let reject!:(reason:Error)=>void;
 handle.lease('opacity',()=>new Promise<void>((_resolve,no)=>{reject=no;}));store.destroy();expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);reject(new Error('after root death'));await store._runtime!.whenCleanupsSettled();expect(store._runtime!.pendingWorkCount).toBe(0);expect(store._runtime!.diagnostics.some(event=>event.type==='failure'&&event.phase==='cleanup'&&event.error.message==='after root death')).toBe(true);
});

it('async adopted motion cleanup keeps the real managed root pending until resolution', async () => {
 const {store, owner, view} = fixture();
 const claim = owner.claim();
 claim.attach();
 const node = document.createElement('div');
 const binding = claim.registry.bind(
  claim.registry.ownerFor(view),
  [{name: 'surface', node, properties: ['opacity'], stable: {opacity: '0.5'}}],
  {channel: 'micro', priority: 0}
 );
 let resolveCleanup!: () => void;
 const cleanupDone = new Promise<void>(resolve => { resolveCleanup = resolve; });
 let cleanupStarted = false;
 binding.start({
  deadlineMs: 1000,
  execute(ctx) {
   ctx.adopt(() => {
    cleanupStarted = true;
    return cleanupDone;
   });
  },
  stable() {}
 });
 binding.release();
 expect(cleanupStarted).toBe(true);
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);
 expect(store._runtime!.pendingWorkCount).toBeGreaterThan(0);
 let settled = false;
 void store._runtime!.whenCleanupsSettled().then(() => { settled = true; });
 await Promise.resolve();
 expect(settled).toBe(false);
 resolveCleanup();
 await store._runtime!.whenCleanupsSettled();
 expect(settled).toBe(true);
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBe(0);
 store.destroy();
 await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.pendingWorkCount).toBe(0);
});

it('rejecting adopted motion cleanup appears in runtime diagnostics and does not reject settlement', async () => {
 expectConsole('error');
 const {store, owner, view} = fixture();
 const claim = owner.claim();
 claim.attach();
 const node = document.createElement('div');
 const binding = claim.registry.bind(
  claim.registry.ownerFor(view),
  [{name: 'surface', node, properties: ['opacity'], stable: {opacity: '0.5'}}],
  {channel: 'micro', priority: 0}
 );
 let rejectCleanup!: (error: unknown) => void;
 const cleanupPromise = new Promise<void>((_, reject) => { rejectCleanup = reject; });
 binding.start({
  deadlineMs: 1000,
  execute(ctx) {
   ctx.adopt(() => cleanupPromise);
  },
  stable() {}
 });
 binding.release();
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);
 const failure = new Error('motion driver teardown failure');
 rejectCleanup(failure);
 await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.diagnostics.some(
  event => event.type === 'failure' && event.phase === 'cleanup' && (event.error as Error).message === 'motion driver teardown failure'
 )).toBe(true);
 store.destroy();
 await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.pendingWorkCount).toBe(0);
});

it('late adopt after run completion and after child/root retirement is invoked exactly once and tracked/diagnosed', async () => {
 expectConsole('error', 2);
 const {store, owner, view} = fixture();
 const claim = owner.claim();
 claim.attach();
 const node = document.createElement('div');
 const binding = claim.registry.bind(
  claim.registry.ownerFor(view),
  [{name: 'surface', node, properties: ['opacity'], stable: {opacity: '0.5'}}],
  {channel: 'micro', priority: 0}
 );
 let context!: MotionRunContext;
 const run = binding.start({ deadlineMs: 1000, execute(ctx) { context = ctx; }, stable() {} });
 await run.settled;
 expect(context.live).toBe(false);

 let childCalls = 0;
 let resolveChildCleanup!: () => void;
 const childCleanupDone = new Promise<void>(resolve => { resolveChildCleanup = resolve; });
 const lateChildCleanup = () => { childCalls++; return childCleanupDone; };
 context.adopt(lateChildCleanup);
 context.adopt(lateChildCleanup);
 expect(childCalls).toBe(1);
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);
 resolveChildCleanup();
 await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBe(0);

 store.dispatch({type: 'remove'});
 expect(claim.registry.size).toBe(0);

 let retiredChildCalls = 0;
 let rejectRetiredCleanup!: (error: unknown) => void;
 const retiredPromise = new Promise<void>((_, reject) => { rejectRetiredCleanup = reject; });
 const lateRetiredCleanup = () => { retiredChildCalls++; return retiredPromise; };
 context.adopt(lateRetiredCleanup);
 context.adopt(lateRetiredCleanup);
 expect(retiredChildCalls).toBe(1);
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);
 rejectRetiredCleanup(new Error('late retired child rejection'));
 await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.diagnostics.some(
  event => event.type === 'failure' && event.phase === 'cleanup' && (event.error as Error).message === 'late retired child rejection'
 )).toBe(true);

 store.destroy();
 let rootDeadCalls = 0;
 let rejectRootDeadCleanup!: (error: unknown) => void;
 const rootDeadPromise = new Promise<void>((_, reject) => { rejectRootDeadCleanup = reject; });
 const lateRootDeadCleanup = () => { rootDeadCalls++; return rootDeadPromise; };
 context.adopt(lateRootDeadCleanup);
 context.adopt(lateRootDeadCleanup);
 expect(rootDeadCalls).toBe(1);
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);
 rejectRootDeadCleanup(new Error('late root dead rejection'));
 await store._runtime!.whenCleanupsSettled();
 expect(store._runtime!.diagnostics.some(
  event => event.type === 'failure' && event.phase === 'cleanup' && (event.error as Error).message === 'late root dead rejection'
 )).toBe(true);
 expect(store._runtime!.pendingWorkCount).toBe(0);
});

it('host visual channel disposal chains its nested cleanup through the host/root record', async () => {
 const {store, owner, view} = fixture();
 const claim = owner.claim();
 claim.attach();
 const captureChannel = new CaptureChannel(claim.registry);
 const visualRecord = captureChannel.visualRecord;
 expect(visualRecord.live).toBe(true);

 const visualHost = claim.registry.visualHost;
 expect(visualHost).toBeDefined();
 expect(visualHost!.live).toBe(true);

 store.dispatch({type: 'remove'});
 expect(visualRecord.live).toBe(true);
 expect(visualHost!.live).toBe(true);

 let resolveCleanup!: () => void;
 const cleanupDone = new Promise<void>(resolve => { resolveCleanup = resolve; });
 visualRecord.addCleanup(() => cleanupDone);

 captureChannel.dispose();
 expect(visualRecord.live).toBe(false);

 claim.release();
 expect(visualHost!.live).toBe(false);

 let settled = false;
 void visualHost!.cleanupSettlement.then(() => { settled = true; });
 await Promise.resolve();
 expect(settled).toBe(false);
 expect(store._runtime!.resourceScope.pendingCleanupCount).toBeGreaterThan(0);

 resolveCleanup();
 await store._runtime!.whenCleanupsSettled();
 await visualHost!.cleanupSettlement;
 expect(settled).toBe(true);
 expect(store._runtime!.pendingWorkCount).toBe(0);
 store.destroy();
});

it('standalone registry cleanup rejection keeps a diagnostic floor without a managed root', async () => {
 const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
 const registry = new TargetRegistry({}, () => true, undefined, undefined, createMotionClock(createDeterministicScheduler()));
 const failure = new Error('standalone cleanup failure');
 registry.observeCleanup(() => Promise.reject(failure));
 await Promise.resolve();
 await Promise.resolve();
 expect(diagnostic).toHaveBeenCalledWith('[Composable Svelte] Resource cleanup error:', failure);
 diagnostic.mockRestore();
});

it('injected scheduler settles deadline timeout without ambient timers', async () => {
 const scheduler = createDeterministicScheduler();
 const store = createStore({
  initialState: { child: { value: 0 } },
  ...definition,
  execution: { ...definition.execution, scheduler }
 });
 const owner = rendererOwner(store, definition.execution);
 const claim = owner.claim();
 claim.attach();
 const node = document.createElement('div');
 const binding = claim.registry.bind(
  claim.registry.rootOwner,
  [{ name: 'surface', node, properties: ['opacity'], stable: { opacity: '0.5' } }],
  { channel: 'micro', priority: 0 }
 );
 let context!: MotionRunContext;
 const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
 const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
 try {
  const run = binding.start({
   deadlineMs: 50,
   execute(c) {
    context = c;
    binding.lease('surface', 'opacity', c).write('0.8');
    return new Promise(() => {});
   },
   stable() {}
  });
  expect(setTimeoutSpy).not.toHaveBeenCalled();
  expect(clearTimeoutSpy).not.toHaveBeenCalled();
  expect(binding.live).toBe(true);
  expect(node.style.opacity).toBe('0.8');
  expect(scheduler.pendingTimersCount).toBe(1);

  await scheduler.advanceTime(50);

  expect(binding.live).toBe(true);
  expect(context.live).toBe(false);
  expect((await run.settled).outcome.status).toBe('timedOut');
  expect(node.style.opacity).toBe('0.5');
  expect(scheduler.pendingTimersCount).toBe(0);
  expect(setTimeoutSpy).not.toHaveBeenCalled();
  expect(clearTimeoutSpy).not.toHaveBeenCalled();
 } finally {
  setTimeoutSpy.mockRestore();
  clearTimeoutSpy.mockRestore();
  store.destroy();
 }
});

it('cancellation clears the scheduler timer handle and does not call ambient clearTimeout', async () => {
 const scheduler = createDeterministicScheduler();
 const store = createStore({
  initialState: { child: { value: 0 } },
  ...definition,
  execution: { ...definition.execution, scheduler }
 });
 const owner = rendererOwner(store, definition.execution);
 const claim = owner.claim();
 claim.attach();
 const node = document.createElement('div');
 const binding = claim.registry.bind(
  claim.registry.rootOwner,
  [{ name: 'surface', node, properties: ['opacity'], stable: { opacity: '0.5' } }],
  { channel: 'micro', priority: 0 }
 );
 const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
 const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
 try {
  const run = binding.start({
   deadlineMs: 100,
   execute() { return new Promise(() => {}); },
   stable() {}
  });
  expect(scheduler.pendingTimersCount).toBe(1);
  binding.release();
  expect(binding.live).toBe(false);
  expect((await run.settled).outcome.status).toBe('disposed');
  expect(scheduler.pendingTimersCount).toBe(0);
  expect(setTimeoutSpy).not.toHaveBeenCalled();
  expect(clearTimeoutSpy).not.toHaveBeenCalled();
 } finally {
  setTimeoutSpy.mockRestore();
  clearTimeoutSpy.mockRestore();
  store.destroy();
 }
});

it('two managed roots use independent schedulers without crosstalk', async () => {
 const schedulerA = createDeterministicScheduler();
 const schedulerB = createDeterministicScheduler();
 const storeA = createStore({
  initialState: { child: { value: 0 } },
  ...definition,
  execution: { ...definition.execution, scheduler: schedulerA }
 });
 const storeB = createStore({
  initialState: { child: { value: 0 } },
  ...definition,
  execution: { ...definition.execution, scheduler: schedulerB }
 });
 const claimA = rendererOwner(storeA, definition.execution).claim();
 const claimB = rendererOwner(storeB, definition.execution).claim();
 claimA.attach();
 claimB.attach();
 const nodeA = document.createElement('div');
 const nodeB = document.createElement('div');
 const bindingA = claimA.registry.bind(
  claimA.registry.rootOwner,
  [{ name: 'surface', node: nodeA, properties: ['opacity'], stable: { opacity: '0.5' } }],
  { channel: 'micro', priority: 0 }
 );
 const bindingB = claimB.registry.bind(
  claimB.registry.rootOwner,
  [{ name: 'surface', node: nodeB, properties: ['opacity'], stable: { opacity: '0.5' } }],
  { channel: 'micro', priority: 0 }
 );
 try {
  let contextA!: MotionRunContext;
  let contextB!: MotionRunContext;
  const runA = bindingA.start({
   deadlineMs: 100,
   execute(c) { contextA = c; return new Promise(() => {}); },
   stable() {}
  });
  const runB = bindingB.start({
   deadlineMs: 100,
   execute(c) { contextB = c; return new Promise(() => {}); },
   stable() {}
  });
  expect(schedulerA.pendingTimersCount).toBe(1);
  expect(schedulerB.pendingTimersCount).toBe(1);

  await schedulerA.advanceTime(100);

  expect(contextA.live).toBe(false);
  expect((await runA.settled).outcome.status).toBe('timedOut');
  expect(schedulerA.pendingTimersCount).toBe(0);
  expect(contextB.live).toBe(true);
  expect(schedulerB.pendingTimersCount).toBe(1);

  await schedulerB.advanceTime(100);

  expect(contextB.live).toBe(false);
  expect((await runB.settled).outcome.status).toBe('timedOut');
  expect(schedulerB.pendingTimersCount).toBe(0);
 } finally {
  storeA.destroy();
  storeB.destroy();
 }
});

it('synchronous callback delivery settles safely without leaks and clears returned handle', async () => {
 let clearedCount = 0;
 let clearedHandle: TimerHandle | undefined;
 const syncScheduler: ExecutionScheduler = {
  now: () => 0,
  setTimer(_delay, callback) {
   callback();
   const handle: TimerHandle = { kind: 'timer', id: Symbol('sync-timer') };
   return handle;
  },
  clearTimer(handle) {
   clearedCount++;
   clearedHandle = handle;
  },
  requestFrame: () => ({ kind: 'frame', id: Symbol('frame') }),
  cancelFrame: () => {}
 };
 const store = createStore({
  initialState: { child: { value: 0 } },
  ...definition,
  execution: { ...definition.execution, scheduler: syncScheduler }
 });
 const claim = rendererOwner(store, definition.execution).claim();
 claim.attach();
 const node = document.createElement('div');
 const binding = claim.registry.bind(
  claim.registry.rootOwner,
  [{ name: 'surface', node, properties: ['opacity'], stable: { opacity: '0.5' } }],
  { channel: 'micro', priority: 0 }
 );
 let executeCalled = false;
 let stableCalled = false;
 try {
  const run = binding.start({
   deadlineMs: 50,
   execute() {
    executeCalled = true;
   },
   stable() {
    stableCalled = true;
   }
  });
  expect(executeCalled).toBe(false);
  expect(stableCalled).toBe(true);
  expect(run.live).toBe(false);
  const receipt = await run.settled;
  expect(receipt.outcome.status).toBe('timedOut');
  expect(clearedCount).toBe(1);
  expect(clearedHandle).toBeDefined();
  expect(clearedHandle?.kind).toBe('timer');

  binding.release();
  expect(clearedCount).toBe(1);
 } finally {
  store.destroy();
 }
});
