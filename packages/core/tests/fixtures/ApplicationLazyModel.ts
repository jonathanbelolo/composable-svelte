import {defineApplication} from '../../src/lib/application/index.js';
import {reducer,type State} from './ApplicationBasicModel.js';
/** Test-only observation; production startup decisions remain pure. */
export const decisions:number[]=[];
export const lazyDefinition=defineApplication(reducer,{initialState:(count:number):State=>({count,loaded:false}),startup:state=>{decisions.push(state.count);return state.count===3?{type:'start'}:undefined;}});
export const failedStartupDefinition=defineApplication(reducer,{initialState:(count:number):State=>({count,loaded:false}),startup:()=>{throw new Error('startup decision failed');}});
