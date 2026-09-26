import {DeterministicScheduler} from '../src/lib/execution/scheduler.js';
import {describe,it,expect} from 'vitest';
import {integrate} from '../src/lib/navigation/integrate.js';
import {optionalSlot,keyedSlot,nestedSlot} from '../src/lib/navigation/managed-integration.js';
import {createStore} from '../src/lib/store.svelte.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer,Dispatch} from '../src/lib/types.js';
import type {PresentationAction} from '../src/lib/navigation/types.js';
import {ifLetPresentation} from '../src/lib/navigation/if-let.js';
import {capturedView} from '../src/lib/execution/store-access.js';
type Child={count:number};type CA={type:'increment'}|{type:'close'}|{type:'ready'};
type State={child:Child|null;saved:boolean};type Action={type:'child';action:PresentationAction<CA>}|{type:'open'}|{type:'replace'}|{type:'save'}|{type:'saved'};
const slot=optionalSlot<State,Action>()('child');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
it('extends integrate with real child-first reduction, suppresses removed child effects, and preserves parent save',async()=>{
 const log:string[]=[];let finishSave!:()=>void;
 const child:Reducer<Child,CA>=(state,action)=>{log.push(`child:${action.type}:${state.count}`);return[{count:state.count+1},Effect.run(()=>{log.push(`child-effect:${action.type}`);})];};
 const core:Reducer<State,Action>=(state,action)=>{
  log.push(`core:${action.type}:${state.child?.count??'none'}`);
  if(action.type==='save')return[state,Effect.cancellable('save',async dispatch=>{await new Promise<void>(r=>{finishSave=r;});dispatch({type:'saved'});})];
  if(action.type==='saved')return[{...state,saved:true},Effect.none()];
  if(action.type==='child'&&action.action.type==='presented'&&action.action.action.type==='close')return[{...state,child:null},Effect.run(()=>{log.push('parent-close-save');})];
  return[state,Effect.none()];
 };
 const definition=integrate(core).managed().with(slot,child).build();
 const store=createStore({initialState:{child:{count:0},saved:false},...definition});
 store.dispatch({type:'save'});store.dispatch(slot.wrap({type:'close'}));
 expect(log).toEqual(['core:save:0','child:close:0','core:child:1','parent-close-save']);expect(store.state.child).toBeNull();finishSave();await flush();expect(store.state.saved).toBe(true);expect(log.at(-1)).toBe('core:saved:none');store.destroy();
});
it('creates initial child work explicitly and invalidates captured same-case handles on replacement',async()=>{
 const log:string[]=[];
 const child:Reducer<Child,CA>=(state,action)=>{log.push(`child:${action.type}`);return[{count:state.count+1},Effect.none()];};
 const core:Reducer<State,Action>=(state,action)=>{log.push(`core:${action.type}`);return[action.type==='open'||action.type==='replace'?{...state,child:{count:0}}:state,Effect.none()];};
 const definition=integrate(core).managed().with(slot,child,{replaceOn:action=>action.type==='replace',onCreate:()=>Effect.run(dispatch=>{log.push('initial-work');dispatch({type:'ready'});})}).build();
 const store=createStore({initialState:{child:null,saved:false},...definition});expect(definition.bind(store,slot)).toBeUndefined();
 store.dispatch({type:'open'});expect(log).toEqual(['core:open','initial-work','child:ready','core:child']);
 const old=definition.bind(store,slot)!;expect(old.state?.count).toBe(1);expect('destroy'in old).toBe(false);expect('history'in old).toBe(false);
 log.length=0;store.dispatch({type:'replace'});expect(log).toEqual(['core:replace','initial-work','child:ready','core:child']);
 old.dispatch({type:'increment'});expect(old.state).toBeUndefined();expect(store.state.child?.count).toBe(1);
 const current=definition.bind(store,slot)!;current.dispatch({type:'increment'});expect(store.state.child?.count).toBe(2);await flush();store.destroy();
});
it('composition definitions are reusable across independent roots, and reject unrelated/legacy stores',()=>{
 const child:Reducer<Child,CA>=(state)=>[{count:state.count+1},Effect.none()];const core:Reducer<State,Action>=state=>[state,Effect.none()];
 const definition=integrate(core).managed().with(slot,child).build();
 const a=createStore({initialState:{child:{count:0},saved:false},...definition});const b=createStore({initialState:{child:{count:10},saved:false},...definition});
 const bound=definition.bind(a,slot)!;bound.dispatch({type:'increment'});expect(a.state.child?.count).toBe(1);expect(b.state.child?.count).toBe(10);a.destroy();bound.dispatch({type:'increment'});expect(b.state.child?.count).toBe(10);
 const legacy=createStore({initialState:{child:{count:0},saved:false},reducer:core});expect(()=>definition.bind(legacy,slot)).toThrow('managed root');
 const other=createStore({initialState:{child:{count:0},saved:false},reducer:core,execution:{mode:'managed'}});expect(()=>definition.bind(other,slot)).toThrow('does not belong');b.destroy();legacy.destroy();other.destroy();
});
it('rejects switching an already configured legacy builder and duplicate managed fields',()=>{
 const child:Reducer<Child,CA>=state=>[state,Effect.none()];const core:Reducer<State,Action>=state=>[state,Effect.none()];
 expect(()=>integrate(core).with('child',child).managed()).toThrow('before registering');expect(()=>integrate(core).managed().with(slot,child).with(slot,child)).toThrow('already registered');
});
type Leaf={value:number};type LA={type:'increment'};
type Panel={detail:Leaf|null;rows:{id:number;state:Leaf}[]};type PA={type:'detail';action:PresentationAction<LA>}|{type:'rows';id:number;action:LA};
type Root={panel:Panel|null};type RA={type:'panel';action:PresentationAction<PA>};
it('composes nested optional and keyed children exactly once with inferred bound actions',()=>{
 const trace:string[]=[];const detail=optionalSlot<Panel,PA>()('detail');const rows=keyedSlot<Panel,PA>()('rows');const panel=optionalSlot<Root,RA>()('panel');
 const leaf:Reducer<Leaf,LA>=(state)=>{trace.push('leaf');return[{value:state.value+1},Effect.none()];};
 const panelCore:Reducer<Panel,PA>=(state)=>{trace.push('panel');return[state,Effect.none()];};
 const rootCore:Reducer<Root,RA>=(state)=>{trace.push('root');return[state,Effect.none()];};
 const panelFeature=integrate(panelCore).managed().with(detail,leaf).forEach(rows,leaf).build();
 const rootFeature=integrate(rootCore).managed().with(panel,panelFeature).build();
 const store=createStore({initialState:{panel:{detail:{value:0},rows:[{id:1,state:{value:10}},{id:2,state:{value:20}}]}},...rootFeature});
 const row=rootFeature.bind(store,nestedSlot(panel,rows.at(1)))!;row.dispatch({type:'increment'});expect(trace).toEqual(['leaf','panel','root']);expect(row.state?.value).toBe(11);expect(store.state.panel?.rows[1]?.state.value).toBe(20);
 trace.length=0;const detailView=rootFeature.bind(store,nestedSlot(panel,detail))!;detailView.dispatch({type:'increment'});expect(trace).toEqual(['leaf','panel','root']);expect(detailView.state?.value).toBe(1);store.destroy();
});
it('rejects an independently created token even when its field string and TypeScript schema match',()=>{
 const core:Reducer<State,Action>=state=>[state,Effect.none()];const child:Reducer<Child,CA>=state=>[state,Effect.none()];
 const definition=integrate(core).managed().with(slot,child).build();const store=createStore({initialState:{child:{count:0},saved:false},...definition});
 const foreign=optionalSlot<State,Action>()('child');expect(()=>definition.bind(store,foreign)).toThrow('not registered');store.destroy();
});
it('keyed reorder retains identity but removal/reinsertion retires the captured element capability',()=>{
 type S={rows:{id:string;state:Child}[]};type A={type:'rows';id:string;action:CA}|{type:'reverse'}|{type:'remove'}|{type:'insert'};
 const rows=keyedSlot<S,A>()('rows');let childCalls=0,parentCalls=0;
 const child:Reducer<Child,CA>=state=>{childCalls++;return[{count:state.count+1},Effect.none()];};
 const core:Reducer<S,A>=(state,action)=>{parentCalls++;return[action.type==='reverse'?{rows:[...state.rows].reverse()}:action.type==='remove'?{rows:state.rows.filter(item=>item.id!=='a')}:action.type==='insert'?{rows:[...state.rows,{id:'a',state:{count:100}}]}:state,Effect.none()];};
 const definition=integrate(core).managed().forEach(rows,child).build();const store=createStore({initialState:{rows:[{id:'a',state:{count:0}},{id:'b',state:{count:10}}]},...definition});const captured=definition.bind(store,rows.at('a'))!;
 store.dispatch({type:'reverse'});captured.dispatch({type:'increment'});expect(captured.state?.count).toBe(1);expect([childCalls,parentCalls]).toEqual([1,2]);
 store.dispatch({type:'remove'});store.dispatch({type:'insert'});captured.dispatch({type:'increment'});expect(captured.state).toBeUndefined();expect([childCalls,parentCalls]).toEqual([1,4]);
 definition.bind(store,rows.at('a'))?.dispatch({type:'increment'});expect(store.state.rows.find(item=>item.id==='a')?.state.count).toBe(101);expect([childCalls,parentCalls]).toEqual([2,5]);store.destroy();
});
it('runs core once even when a routed child action leaves child state unchanged',()=>{
 let childCalls=0,coreCalls=0;const child:Reducer<Child,CA>=state=>{childCalls++;return[state,Effect.none()];};const core:Reducer<State,Action>=state=>{coreCalls++;return[state,Effect.none()];};
 const definition=integrate(core).managed().with(slot,child).build();const store=createStore({initialState:{child:{count:0},saved:false},...definition});definition.bind(store,slot)?.dispatch({type:'ready'});expect([childCalls,coreCalls]).toEqual([1,1]);expect(store.state.child?.count).toBe(0);store.destroy();
});
it('new child subscriptions acquire the new owner and old callbacks never retarget replacement',()=>{
 const callbacks:Dispatch<CA>[]=[];let cleaned=0;
 const child:Reducer<Child,CA>=state=>[{count:state.count+1},Effect.none()];const core:Reducer<State,Action>=(state,action)=>[action.type==='open'||action.type==='replace'?{...state,child:{count:0}}:state,Effect.none()];
 const definition=integrate(core).managed().with(slot,child,{replaceOn:action=>action.type==='replace',onCreate:()=>Effect.subscription('source',dispatch=>{callbacks.push(dispatch);return()=>{cleaned++;};})}).build();
 const store=createStore({initialState:{child:null,saved:false},...definition});store.dispatch({type:'open'});expect(callbacks).toHaveLength(1);store.dispatch({type:'replace'});expect(callbacks).toHaveLength(2);expect(cleaned).toBe(1);
 callbacks[0]?.({type:'increment'});expect(store.state.child?.count).toBe(0);callbacks[1]?.({type:'increment'});expect(store.state.child?.count).toBe(1);store.destroy();expect(cleaned).toBe(2);
});

it('keeps typed composition binding when a store injects its own scheduler',()=>{
 const core:Reducer<State,Action>=state=>[state,Effect.none()];const child:Reducer<Child,CA>=state=>[{count:state.count+1},Effect.none()];const definition=integrate(core).managed().with(slot,child).build();
 const store=createStore({initialState:{child:{count:0},saved:false},...definition,execution:{...definition.execution,scheduler:new DeterministicScheduler()}});definition.bind(store,slot)?.dispatch({type:'increment'});expect(store.state.child?.count).toBe(1);store.destroy();
});
it('runs the separate generic consumer fixture without application-owned lifecycle plumbing',async()=>{
 const {createDemonstrationWorkspace,workspace,draftSlot}=await import('./fixtures/ManagedCompositionConsumer.js');const root=createDemonstrationWorkspace();
 root.dispatch({type:'openDraft'});const draft=workspace.bind(root,draftSlot);draft?.dispatch({type:'rename',title:'A generic document'});root.dispatch({type:'publish'});expect(root.state.publishedTitle).toBe('A generic document');expect(draft?.state).toBeUndefined();root.destroy();
});
it('keeps canonical -0 and +0 keyed replacement identities distinct',()=>{
 type S={rows:{id:number;state:{label:string}}[]};type A={type:'replace'}|{type:'rows';id:number;action:{type:'noop'}};
 const rows=keyedSlot<S,A>()('rows');const ran:string[]=[];const core:Reducer<S,A>=state=>[state,Effect.none()];const child:Reducer<{label:string},{type:'noop'}>=state=>[state,Effect.none()];
 const definition=integrate(core).managed().forEach(rows,child,{replaceOn:(action,id)=>action.type==='replace'&&Object.is(id,-0),onCreate:state=>Effect.run(()=>{ran.push(state.label);})}).build();
 const store=createStore({initialState:{rows:[{id:-0,state:{label:'minus'}},{id:0,state:{label:'plus'}}]},...definition});expect(()=>store.dispatch({type:'replace'})).not.toThrow();expect(ran).toEqual(['minus']);store.destroy();
});
it('accepts ancestor removal that supersedes a nested replacement from the same reduction',()=>{
 const detail=optionalSlot<Panel,PA>()('detail');const panel=optionalSlot<Root,RA>()('panel');let children=0,parents=0,roots=0;
 const leaf:Reducer<Leaf,LA>=state=>{children++;return[state,Effect.none()];};const panelCore:Reducer<Panel,PA>=state=>{parents++;return[{...state,detail:{value:100}},Effect.none()];};const rootCore:Reducer<Root,RA>=state=>{roots++;return[{...state,panel:null},Effect.none()];};
 const inside=integrate(panelCore).managed().with(detail,leaf,{replaceOn:()=>true}).build();const definition=integrate(rootCore).managed().with(panel,inside).build();const store=createStore({initialState:{panel:{detail:{value:0},rows:[]}},...definition});
 const view=definition.bind(store,nestedSlot(panel,detail));expect(()=>view?.dispatch({type:'increment'})).not.toThrow();expect(store.state.panel).toBeNull();expect([children,parents,roots]).toEqual([1,1,1]);store.destroy();
});
it('honours a nested replacement while its detail survives and discards it when an outer core removes only that detail',()=>{
 type D={value:number};type DA={type:'increment'};type P={detail:D|null};type PAct={type:'detail';action:PresentationAction<DA>};
 type R={panel:P|null};type RAct={type:'panel';action:PresentationAction<PAct>};
 const detail=optionalSlot<P,PAct>()('detail');const panel=optionalSlot<R,RAct>()('panel');let created=0;
 const leaf:Reducer<D,DA>=state=>[{value:state.value+1},Effect.none()];const panelCore:Reducer<P,PAct>=state=>[state,Effect.none()];
 const rootCore:Reducer<R,RAct>=state=>{const current=state.panel;return[current&&current.detail&&current.detail.value>=2?{panel:{...current,detail:null}}:state,Effect.none()];};
 const inside=integrate(panelCore).managed().with(detail,leaf,{replaceOn:()=>true,onCreate:()=>Effect.run(()=>{created++;})}).build();const definition=integrate(rootCore).managed().with(panel,inside).build();
 const store=createStore({initialState:{panel:{detail:{value:0}}},...definition});const panelView=definition.bind(store,panel)!;const first=definition.bind(store,nestedSlot(panel,detail))!;
 first.dispatch({type:'increment'});expect(created).toBe(1);expect(first.state).toBeUndefined();expect(store.state).toEqual({panel:{detail:{value:1}}});
 const second=definition.bind(store,nestedSlot(panel,detail))!;expect(()=>second.dispatch({type:'increment'})).not.toThrow();
 expect(store.state).toEqual({panel:{detail:null}});expect(created).toBe(1);expect(second.state).toBeUndefined();expect(panelView.state).toEqual({detail:null});store.destroy();
});
it('honours a keyed replacement while its element survives and discards it when an outer core removes only that element',()=>{
 type D={value:number};type DA={type:'increment'};type P={rows:{id:number;state:D}[]};type PAct={type:'rows';id:number;action:DA};
 type R={panel:P|null};type RAct={type:'panel';action:PresentationAction<PAct>};
 const rows=keyedSlot<P,PAct>()('rows');const panel=optionalSlot<R,RAct>()('panel');let created=0;
 const leaf:Reducer<D,DA>=state=>[{value:state.value+1},Effect.none()];const panelCore:Reducer<P,PAct>=state=>[state,Effect.none()];
 const rootCore:Reducer<R,RAct>=state=>[state.panel?{panel:{rows:state.panel.rows.filter(row=>row.state.value<2)}}:state,Effect.none()];
 const inside=integrate(panelCore).managed().forEach(rows,leaf,{replaceOn:(action,id)=>action.id===id,onCreate:()=>Effect.run(()=>{created++;})}).build();const definition=integrate(rootCore).managed().with(panel,inside).build();
 const store=createStore({initialState:{panel:{rows:[{id:1,state:{value:0}},{id:2,state:{value:0}}]}},...definition});const sibling=definition.bind(store,nestedSlot(panel,rows.at(2)))!;const first=definition.bind(store,nestedSlot(panel,rows.at(1)))!;
 first.dispatch({type:'increment'});expect(created).toBe(1);expect(first.state).toBeUndefined();expect(store.state.panel?.rows.map(row=>row.state.value)).toEqual([1,0]);
 const second=definition.bind(store,nestedSlot(panel,rows.at(1)))!;expect(()=>second.dispatch({type:'increment'})).not.toThrow();
 expect(store.state.panel?.rows).toEqual([{id:2,state:{value:0}}]);expect(created).toBe(1);expect(second.state).toBeUndefined();expect(sibling.state).toEqual({value:0});store.destroy();
});
it('stamps keyed element work with the element owner so same-turn removal drops it while live elements start theirs',async()=>{
 type C={value:number};type CAct={type:'work'}|{type:'leave'};type S={rows:{id:number;state:C}[]};type A={type:'rows';id:number;action:CAct};
 const rows=keyedSlot<S,A>()('rows');const started:string[]=[];
 const child:Reducer<C,CAct>=(state,action)=>[{value:state.value+1},Effect.run(()=>{started.push(`${action.type}:${state.value}`);})];
 const core:Reducer<S,A>=(state,action)=>[action.action.type==='leave'?{rows:state.rows.filter(row=>row.id!==action.id)}:state,Effect.none()];
 const definition=integrate(core).managed().forEach(rows,child).build();const store=createStore({initialState:{rows:[{id:1,state:{value:10}},{id:2,state:{value:20}}]},...definition});
 const first=definition.bind(store,rows.at(1))!;const sibling=definition.bind(store,rows.at(2))!;
 first.dispatch({type:'work'});sibling.dispatch({type:'work'});await flush();expect(started).toEqual(['work:10','work:20']);
 first.dispatch({type:'leave'});await flush();
 expect(started).toEqual(['work:10','work:20']);expect(store.state.rows.map(row=>row.id)).toEqual([2]);expect(first.state).toBeUndefined();
 sibling.dispatch({type:'work'});await flush();expect(started).toEqual(['work:10','work:20','work:21']);expect(sibling.state).toEqual({value:22});store.destroy();
});
it('keeps nested detail work owned by the detail so replacement drops it while panel work and the new detail stay live',async()=>{
 type D={value:number};type DA={type:'work'}|{type:'replace'};type P={detail:D|null};type PAct={type:'detail';action:PresentationAction<DA>};
 type R={panel:P|null};type RAct={type:'panel';action:PresentationAction<PAct>};
 const detail=optionalSlot<P,PAct>()('detail');const panel=optionalSlot<R,RAct>()('panel');const detailWork:string[]=[];let panelWork=0;
 const leaf:Reducer<D,DA>=(state,action)=>[{value:state.value+1},Effect.run(()=>{detailWork.push(`${action.type}:${state.value}`);})];
 const panelCore:Reducer<P,PAct>=state=>[state,Effect.run(()=>{panelWork++;})];const rootCore:Reducer<R,RAct>=state=>[state,Effect.none()];
 const inside=integrate(panelCore).managed().with(detail,leaf,{replaceOn:action=>action.action.type==='presented'&&action.action.action.type==='replace'}).build();const definition=integrate(rootCore).managed().with(panel,inside).build();
 const store=createStore({initialState:{panel:{detail:{value:0}}},...definition});const panelView=definition.bind(store,panel)!;const old=definition.bind(store,nestedSlot(panel,detail))!;
 old.dispatch({type:'work'});await flush();expect(detailWork).toEqual(['work:0']);expect(panelWork).toBe(1);expect(old.state).toEqual({value:1});
 old.dispatch({type:'replace'});await flush();
 expect(detailWork).toEqual(['work:0']);expect(panelWork).toBe(2);expect(old.state).toBeUndefined();expect(panelView.state).toEqual({detail:{value:2}});
 const current=definition.bind(store,nestedSlot(panel,detail))!;current.dispatch({type:'work'});await flush();expect(detailWork).toEqual(['work:0','work:2']);expect(panelWork).toBe(3);expect(current.state).toEqual({value:3});store.destroy();
});
it('retires bound subscriptions with one final undefined and no later notifications',()=>{
 const child:Reducer<Child,CA>=state=>[state,Effect.none()];const core:Reducer<State,Action>=(state,action)=>[action.type==='replace'?{...state,child:{count:5}}:action.type==='saved'?{...state,saved:true}:state,Effect.none()];const definition=integrate(core).managed().with(slot,child,{replaceOn:action=>action.type==='replace'}).build();const store=createStore({initialState:{child:{count:0},saved:false},...definition});const view=definition.bind(store,slot)!;const values:Array<number|undefined>=[];
 view.subscribe(state=>values.push(state?.count));store.dispatch({type:'replace'});store.dispatch({type:'saved'});expect(values).toEqual([0,undefined]);expect(store._runtime!.resourceScope.size).toBe(0);const late:Array<number|undefined>=[];view.subscribe(state=>late.push(state?.count));expect(late).toEqual([undefined]);expect(store._runtime!.resourceScope.size).toBe(0);store.destroy();expect(values).toEqual([0,undefined]);
});
it('dead root invalidates reads and new bindings, and retires child-view subscriptions',()=>{
 const core:Reducer<State,Action>=state=>[state,Effect.none()];const child:Reducer<Child,CA>=state=>[state,Effect.none()];const definition=integrate(core).managed().with(slot,child).build();const store=createStore({initialState:{child:{count:0},saved:false},...definition});const view=definition.bind(store,slot)!;const values:Array<number|undefined>=[];view.subscribe(state=>values.push(state?.count));store.destroy();expect(view.state).toBeUndefined();expect(values).toEqual([0,undefined]);expect(()=>definition.bind(store,slot)).toThrow('destroyed');const late:Array<number|undefined>=[];view.subscribe(state=>late.push(state?.count));expect(late).toEqual([undefined]);expect(store._runtime!.resourceScope.size).toBe(0);
});
it('explicit child-view unsubscribe is silent and releases only its own record',()=>{
 const core:Reducer<State,Action>=state=>[state,Effect.none()];const child:Reducer<Child,CA>=state=>[state,Effect.none()];const definition=integrate(core).managed().with(slot,child).build();const store=createStore({initialState:{child:{count:0},saved:false},...definition});const view=definition.bind(store,slot)!;const a:Array<number|undefined>=[],b:Array<number|undefined>=[];const stop=view.subscribe(state=>a.push(state?.count));view.subscribe(state=>b.push(state?.count));expect(store._runtime!.resourceScope.size).toBe(2);stop();stop();expect(store._runtime!.resourceScope.size).toBe(1);expect(a).toEqual([0]);store.destroy();expect(a).toEqual([0]);expect(b).toEqual([0,undefined]);
});
it('a synchronous initial subscriber can remove its owner without leaking registration',()=>{
 const core:Reducer<State,Action>=state=>[state,Effect.none()];const child:Reducer<Child,CA>=state=>[state,Effect.none()];const definition=integrate(core).managed().with(slot,child).build();const store=createStore({initialState:{child:{count:0},saved:false},...definition});const view=definition.bind(store,slot)!;const values:Array<number|undefined>=[];view.subscribe(state=>{values.push(state?.count);if(state)store.dispatch({type:'child',action:{type:'dismiss'}});});expect(values).toEqual([0,undefined]);expect(store.state.child).toBeNull();expect(store._runtime!.resourceScope.size).toBe(0);store.destroy();
});
it('invalid direct replacement requests still fail in the shared allocator',()=>{
 const store=createStore({initialState:0,reducer:(state:number,_action:string)=>[state,Effect.none<string>()] as const,execution:{mode:'managed',slots:{select:()=>[]},_reduce:({state,action,dependencies,reducer})=>{const[next,effect]=reducer(state,action,dependencies);return[next,effect,[{type:'replace',path:[{slot:'missing'}]}]];}}});expect(()=>store.dispatch('bad')).toThrow();expect(store.history).toEqual([]);store.destroy();
});
it('cleans keyed element reducer subscriptions on later removal, drops late dispatches, and preserves sibling subscriptions',()=>{
 type C={id:number;value:number};type CA={type:'sub'}|{type:'tick'};
 type S={rows:{id:number;state:C}[]};type A={type:'rows';id:number;action:CA}|{type:'remove';id:number};
 const rows=keyedSlot<S,A>()('rows');
 const callbacks:Dispatch<CA>[]=[];const cleaned:number[]=[];
 const child:Reducer<C,CA>=(state,action)=>{
  if(action.type==='sub')return[state,Effect.subscription('source',dispatch=>{callbacks.push(dispatch);return()=>{cleaned.push(state.id);};})];
  if(action.type==='tick')return[{...state,value:state.value+1},Effect.none()];
  return[state,Effect.none()];
 };
 const core:Reducer<S,A>=(state,action)=>{
  if(action.type==='remove')return[{rows:state.rows.filter(r=>r.id!==action.id)},Effect.none()];
  return[state,Effect.none()];
 };
 const definition=integrate(core).managed().forEach(rows,child).build();
 const store=createStore({initialState:{rows:[{id:1,state:{id:1,value:10}},{id:2,state:{id:2,value:20}}]},...definition});
 const first=definition.bind(store,rows.at(1))!;
 const sibling=definition.bind(store,rows.at(2))!;
 first.dispatch({type:'sub'});sibling.dispatch({type:'sub'});
 expect(callbacks).toHaveLength(2);expect(cleaned).toEqual([]);expect(store._runtime!.resourceScope.size).toBe(2);
 store.dispatch({type:'remove',id:1});
 expect(store.state.rows.map(r=>r.id)).toEqual([2]);expect(first.state).toBeUndefined();expect(cleaned).toEqual([1]);expect(store._runtime!.resourceScope.size).toBe(1);
 const historyCount=store.history.length;
 callbacks[0]!({type:'tick'});
 expect(store.history.length).toBe(historyCount);expect(store.state.rows).toEqual([{id:2,state:{id:2,value:20}}]);expect(cleaned).toEqual([1]);
 callbacks[1]!({type:'tick'});
 expect(store.history.length).toBe(historyCount+1);expect(store.state.rows).toEqual([{id:2,state:{id:2,value:21}}]);expect(sibling.state?.value).toBe(21);expect(cleaned).toEqual([1]);expect(store._runtime!.resourceScope.size).toBe(1);
 store.destroy();
 expect(cleaned).toEqual([1,2]);expect(store._runtime!.resourceScope.size).toBe(0);
});
it('cleans nested panel and detail reducer subscriptions on later removal, drops late dispatches, and clears resource scope',()=>{
 type Leaf={value:number};type LA={type:'sub'}|{type:'tick'};
 type Panel={detail:Leaf|null;ticks:number};type PA={type:'detail';action:PresentationAction<LA>}|{type:'sub'}|{type:'tick'};
 type Root={panel:Panel|null};type RA={type:'panel';action:PresentationAction<PA>}|{type:'close'};
 const detail=optionalSlot<Panel,PA>()('detail');
 const panel=optionalSlot<Root,RA>()('panel');
 const detailCallbacks:Dispatch<LA>[]=[];const panelCallbacks:Dispatch<PA>[]=[];
 let detailCleaned=0,panelCleaned=0;
 const leaf:Reducer<Leaf,LA>=(state,action)=>{
  if(action.type==='sub')return[state,Effect.subscription('leaf-source',dispatch=>{detailCallbacks.push(dispatch);return()=>{detailCleaned++;};})];
  if(action.type==='tick')return[{value:state.value+1},Effect.none()];
  return[state,Effect.none()];
 };
 const panelCore:Reducer<Panel,PA>=(state,action)=>{
  if(action.type==='sub')return[state,Effect.subscription('panel-source',dispatch=>{panelCallbacks.push(dispatch);return()=>{panelCleaned++;};})];
  if(action.type==='tick')return[{...state,ticks:state.ticks+1},Effect.none()];
  return[state,Effect.none()];
 };
 const rootCore:Reducer<Root,RA>=(state,action)=>{
  if(action.type==='close')return[{panel:null},Effect.none()];
  return[state,Effect.none()];
 };
 const panelFeature=integrate(panelCore).managed().with(detail,leaf).build();
 const rootFeature=integrate(rootCore).managed().with(panel,panelFeature).build();
 const store=createStore({initialState:{panel:{detail:{value:0},ticks:0}},...rootFeature});
 const panelView=rootFeature.bind(store,panel)!;
 const detailView=rootFeature.bind(store,nestedSlot(panel,detail))!;
 panelView.dispatch({type:'sub'});
 detailView.dispatch({type:'sub'});
 expect(panelCallbacks).toHaveLength(1);expect(detailCallbacks).toHaveLength(1);
 expect(store._runtime!.resourceScope.size).toBe(2);expect([detailCleaned,panelCleaned]).toEqual([0,0]);
 panelCallbacks[0]!({type:'tick'});
 detailCallbacks[0]!({type:'tick'});
 expect(store.state.panel?.ticks).toBe(1);expect(store.state.panel?.detail?.value).toBe(1);
 expect(panelView.state?.ticks).toBe(1);expect(detailView.state?.value).toBe(1);
 store.dispatch({type:'close'});
 expect(store.state.panel).toBeNull();expect(panelView.state).toBeUndefined();expect(detailView.state).toBeUndefined();
 expect([detailCleaned,panelCleaned]).toEqual([1,1]);expect(store._runtime!.resourceScope.size).toBe(0);
 const historyCount=store.history.length;
 detailCallbacks[0]!({type:'tick'});
 panelCallbacks[0]!({type:'tick'});
 expect(store.history.length).toBe(historyCount);expect(store.state.panel).toBeNull();
 expect([detailCleaned,panelCleaned]).toEqual([1,1]);expect(store._runtime!.resourceScope.size).toBe(0);
 store.destroy();
 expect([detailCleaned,panelCleaned]).toEqual([1,1]);expect(store._runtime!.resourceScope.size).toBe(0);
});
it('routes legacy ifLetPresentation cancelGroup through managed composition, isolating owner cleanup and preserving siblings',()=>{
 type Leaf={value:number};type LA={type:'sub'}|{type:'tick'};
 type Item={detail:Leaf|null};type IA={type:'detail';action:PresentationAction<LA>};
 type S={rows:{id:number;state:Item}[]};type A={type:'rows';id:number;action:IA};
 const rows=keyedSlot<S,A>()('rows');
 const callbacks:Dispatch<LA>[]=[];const cleaned:number[]=[];
 const leaf:Reducer<Leaf,LA>=(state,action)=>{
  if(action.type==='sub')return[state,Effect.subscription('source',dispatch=>{callbacks.push(dispatch);return()=>{cleaned.push(state.value);};})];
  if(action.type==='tick')return[{value:state.value+1},Effect.none()];
  return[state,Effect.none()];
 };
 const itemReducer=ifLetPresentation<Item,IA,Leaf,LA,'detail'>(
  s=>s.detail,
  (s,detail)=>({ ...s,detail }),
  'detail',
  ca=>({type:'detail',action:{type:'presented',action:ca}}),
  leaf
 );
 const core:Reducer<S,A>=state=>[state,Effect.none()];
 const definition=integrate(core).managed().forEach(rows,itemReducer).build();
 const store=createStore({initialState:{rows:[{id:1,state:{detail:{value:10}}},{id:2,state:{detail:{value:20}}}]},...definition});
 try{
 const first=definition.bind(store,rows.at(1))!;
 const sibling=definition.bind(store,rows.at(2))!;
 expect(first).toBeDefined();expect(sibling).toBeDefined();
 first.dispatch({type:'detail',action:{type:'presented',action:{type:'sub'}}});
 sibling.dispatch({type:'detail',action:{type:'presented',action:{type:'sub'}}});
 expect(callbacks).toHaveLength(2);expect(cleaned).toEqual([]);expect(store._runtime!.resourceScope.size).toBe(2);
 first.dispatch({type:'detail',action:{type:'dismiss'}});
 expect(store.state.rows[0]?.state.detail).toBeNull();
 expect(store.state.rows[1]?.state.detail).toEqual({value:20});
 expect(cleaned).toEqual([10]);
 expect(store._runtime!.resourceScope.size).toBe(1);
 const historyCount=store.history.length;
 callbacks[0]!({type:'tick'});
 expect(store.history.length).toBe(historyCount);
 expect(store.state.rows[0]?.state.detail).toBeNull();
 expect(cleaned).toEqual([10]);
 callbacks[1]!({type:'tick'});
 expect(store.history.length).toBe(historyCount+1);
 expect(store.state.rows[1]?.state.detail?.value).toBe(21);
 expect(sibling.state?.detail?.value).toBe(21);
 expect(cleaned).toEqual([10]);
 expect(store._runtime!.resourceScope.size).toBe(1);
 store.destroy();
 expect(cleaned).toEqual([10,20]);
 expect(store._runtime!.resourceScope.size).toBe(0);
 }finally{store.destroy();}
});
it('rejects direct CapturedView.registerResource after child owner retirement and permits fresh rebound registration',()=>{
 type Child={count:number};type CA={type:'increment'};
 type State={child:Child|null};type Action={type:'child';action:PresentationAction<CA>}|{type:'open'}|{type:'close'};
 const slot=optionalSlot<State,Action>()('child');
 const child:Reducer<Child,CA>=state=>[{count:state.count+1},Effect.none()];
 const core:Reducer<State,Action>=(state,action)=>{
  if(action.type==='open')return[{child:{count:0}},Effect.none()];
  if(action.type==='close')return[{child:null},Effect.none()];
  return[state,Effect.none()];
 };
 const definition=integrate(core).managed().with(slot,child).build();
 const store=createStore({initialState:{child:{count:0}},...definition});
 try{
 const view=definition.bind(store,slot)!;
 expect(view).toBeDefined();
 const capture=capturedView(view);
 expect(capture.origin).toBeDefined();
 expect(capture.isLive()).toBe(true);
 expect(store._runtime!.resourceScope.size).toBe(0);
 store.dispatch({type:'close'});
 expect(store.state.child).toBeNull();
 expect(view.state).toBeUndefined();
 expect(capture.isLive()).toBe(false);
 let retiredCleaned=0;
 expect(()=>capture.registerResource({description:'retired-resource',cleanup:()=>{retiredCleaned++;}})).toThrow('Cannot register a retired target');
 expect(retiredCleaned).toBe(0);
 expect(store._runtime!.resourceScope.size).toBe(0);
 store.dispatch({type:'open'});
 expect(store.state.child).toEqual({count:0});
 const freshView=definition.bind(store,slot)!;
 expect(freshView).toBeDefined();
 expect(freshView).not.toBe(view);
 const freshCapture=capturedView(freshView);
 expect(freshCapture.origin).toBeDefined();
 expect(freshCapture.origin).not.toBe(capture.origin);
 expect(freshCapture.isLive()).toBe(true);
 let freshCleaned=0;
 const record=freshCapture.registerResource({description:'fresh-resource',cleanup:()=>{freshCleaned++;}});
 expect(record).toBeDefined();
 expect(store._runtime!.resourceScope.size).toBe(1);
 expect(freshCleaned).toBe(0);
 store.destroy();
 expect(freshCleaned).toBe(1);
 expect(retiredCleaned).toBe(0);
 expect(store._runtime!.resourceScope.size).toBe(0);
 record.dispose();
 expect(freshCleaned).toBe(1);
 }finally{store.destroy();}
});
