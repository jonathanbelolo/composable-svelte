/** Executable-consumer declarations: no any, casts, or manual lifecycle plumbing. */
import {integrate} from '../src/lib/navigation/integrate.js';
import {optionalSlot,keyedSlot,nestedSlot} from '../src/lib/navigation/managed-integration.js';
import {createStore} from '../src/lib/store.svelte.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer} from '../src/lib/types.js';
import type {PresentationAction} from '../src/lib/navigation/types.js';
type Child={value:number};type ChildAction={type:'increment';amount:number};
type State={child:Child|null;rows:{id:number;state:Child}[];name:string};
type Action={type:'child';action:PresentationAction<ChildAction>}|{type:'rows';id:number;action:ChildAction}|{type:'open'};
const child=optionalSlot<State,Action>()('child');const rows=keyedSlot<State,Action>()('rows');
const reducer:Reducer<Child,ChildAction>=(state,action)=>[{value:state.value+action.amount},Effect.none()];
const core:Reducer<State,Action>=state=>[state,Effect.none()];
const feature=integrate(core).managed().with(child,reducer,{replaceOn:action=>action.type==='open',onCreate:state=>Effect.run(dispatch=>dispatch({type:'increment',amount:state.value}))}).forEach(rows,reducer).build();
const root=createStore({initialState:{child:{value:0},rows:[],name:''},...feature});
feature.bind(root,child)?.dispatch({type:'increment',amount:1});feature.bind(root,rows.at(123))?.select(state=>state?.value);
// @ts-expect-error misspelled optional field
optionalSlot<State,Action>()('chlid');
// @ts-expect-error nonoptional field and unrelated action convention
optionalSlot<State,Action>()('name');
// @ts-expect-error collection key has numeric identity
rows.at('123');
// @ts-expect-error wrong child action
feature.bind(root,child)?.dispatch({type:'open'});
// @ts-expect-error child handles do not own root destruction
feature.bind(root,child)?.destroy();
// @ts-expect-error child handles do not expose root history
feature.bind(root,child)?.history;
const wrong:Reducer<Child,{type:'other'}>=state=>[state,Effect.none()];
// @ts-expect-error reducer action does not match the typed slot
integrate(core).managed().with(child,wrong);
type Outer={panel:State|null};type OuterAction={type:'panel';action:PresentationAction<Action>};
const panel=optionalSlot<Outer,OuterAction>()('panel');const outerCore:Reducer<Outer,OuterAction>=state=>[state,Effect.none()];
const outer=integrate(outerCore).managed().with(panel,feature).build();const outerStore=createStore({initialState:{panel:{child:null,rows:[],name:''}},...outer});
outer.bind(outerStore,nestedSlot(panel,rows.at(7)))?.dispatch({type:'increment',amount:2});
// @ts-expect-error root schema and action token do not match the nested schema
outer.bind(outerStore,child);
root.destroy();outerStore.destroy();
// @ts-expect-error missing PresentationAction routing case must not infer an unknown action
optionalSlot<State,{type:'open'}>()('child');
// @ts-expect-error missing keyed routing case must not be accepted
keyedSlot<State,{type:'open'}>()('rows');
// @ts-expect-error malformed presentation wrapper is not a child action contract
optionalSlot<State,{type:'child';action:{type:'wrong'}}>()('child');
// @ts-expect-error same-field incompatible action arm cannot be treated as a presentation
optionalSlot<State,Action|{type:'child';action:{type:'foreign'}}>()('child');
// @ts-expect-error state/action keyed identity domains must agree, not just be assignable one way
keyedSlot<{rows:{id:string;state:Child}[]},{type:'rows';id:'a';action:ChildAction}>()('rows');
// @ts-expect-error wrapping cannot omit additional required parent routing fields
optionalSlot<State,{type:'child';action:PresentationAction<ChildAction>;tenant:string}>()('child');
// @ts-expect-error keyed routing cannot require an extra outer field the wrapper cannot construct
keyedSlot<State,{type:'rows';id:number;action:ChildAction;tenant:string}>()('rows');
// @ts-expect-error identified collections require string or number keys
keyedSlot<{rows:{id:boolean;state:Child}[]},{type:'rows';id:boolean;action:ChildAction}>()('rows');
