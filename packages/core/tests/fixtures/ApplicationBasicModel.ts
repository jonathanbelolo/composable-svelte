import {defineApplication} from '../../src/lib/application/index.js';
import {Effect} from '../../src/lib/effect.js';
import type {Reducer} from '../../src/lib/types.js';
export type State={count:number;loaded:boolean};
export type Action={type:'increment'}|{type:'start'}|{type:'explode'};
export type Dependencies={step:number;events:string[]};
export const reducer:Reducer<State,Action,Dependencies>=(state,action,deps)=>{
 if(action.type==='explode')throw new Error('reducer exploded');
 if(action.type==='start')return [{...state,loaded:true},Effect.subscription('application-live',()=>{deps.events.push('start');return()=>{deps.events.push('cleanup');};})];
 return [{...state,count:state.count+deps.step},Effect.none()];
};
export const definition=defineApplication(reducer,{initialState:(count:number):State=>({count,loaded:false}),startup:state=>state.loaded?undefined:{type:'start'}});
