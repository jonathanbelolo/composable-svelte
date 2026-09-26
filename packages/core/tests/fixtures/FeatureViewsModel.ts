import {defineApplication,optionalSlot,keyedSlot,ManagedIntegrationBuilder,type ChildView,type FeatureView,type FeatureViewPropsOf} from '../../src/lib/application/index.js';
import {Effect} from '../../src/lib/effect.js';
import type {Reducer} from '../../src/lib/types.js';
import type {PresentationAction} from '../../src/lib/navigation/types.js';
export type Leaf={name:string;count:number};export type LA={type:'increment'};
export type Workspace={editor:Leaf|null};export type WA={type:'editor';action:PresentationAction<LA>};
export type Root={workspace:Workspace|null;worker:Leaf|null;rows:{id:number;state:Leaf}[]};
export type Action={type:'workspace';action:PresentationAction<WA>}|{type:'worker';action:PresentationAction<LA>}|{type:'rows';id:number;action:LA}|{type:'close'}|{type:'open'}|{type:'replace'}|{type:'removeRow';id?:number}|{type:'addRow'}|{type:'reorder'}|{type:'replaceRow'}|{type:'boot'};
export type Deps={step:number;trace:string[]};
export const events:string[]=[];export const captured:ChildView<Leaf,LA>[]=[];
export const editorSlot=optionalSlot<Workspace,WA>()('editor');export const workspaceSlot=optionalSlot<Root,Action>()('workspace');export const workerSlot=optionalSlot<Root,Action>()('worker');export const rowsSlot=keyedSlot<Root,Action>()('rows');
export const leaf:Reducer<Leaf,LA,Deps>=(state,_action,deps)=>{deps.trace.push(state.name);return[{...state,count:state.count+deps.step},Effect.none()];};
const workspace:Reducer<Workspace,WA,Deps>=(state,_action,deps)=>{deps.trace.push('workspace');return[state,Effect.none()];};
export const workspaceComposition=new ManagedIntegrationBuilder(workspace).with(editorSlot,leaf).build();
const root:Reducer<Root,Action,Deps>=(state,action,deps)=>{deps.trace.push('root');if(action.type==='boot')return[state,Effect.run(()=>{deps.trace.push('started');})];if(action.type==='close')return[{...state,workspace:null},Effect.none()];if(action.type==='open')return[{...state,workspace:{editor:{name:'editor',count:0}}},Effect.none()];if(action.type==='removeRow')return[{...state,rows:state.rows.filter(row=>row.id!==(action.id??1))},Effect.none()];if(action.type==='addRow')return[{...state,rows:[...state.rows,{id:1,state:{name:'row1',count:0}}]},Effect.none()];if(action.type==='reorder')return[{...state,rows:[...state.rows].reverse()},Effect.none()];return[state,Effect.none()];};
export const composition=new ManagedIntegrationBuilder(root).with(workspaceSlot,workspaceComposition,{replaceOn:action=>action.type==='replace'}).with(workerSlot,leaf).forEach(rowsSlot,leaf,{replaceOn:(action,id)=>action.type==='replaceRow'&&id===1}).build();
export const initial=(count:number):Root=>({workspace:{editor:{name:'editor',count}},worker:{name:'worker',count:0},rows:[{id:1,state:{name:'row1',count:1}},{id:2,state:{name:'row2',count:2}}]});
export const application=defineApplication(composition,{initialState:initial});

export const startupApplication=defineApplication(composition,{initialState:initial,startup:()=>({type:'boot'})});

export const retainedNestedViews:FeatureView<Leaf,LA,{}>[]=[];

export type WorkspaceView=FeatureViewPropsOf<typeof composition>['views']['workspace'];
