import {it,expect,vi} from 'vitest';
import {createApplication} from '../src/lib/application/create-application.js';
import {defineApplication} from '../src/lib/application/definition.js';
import {useApplication} from '../src/lib/application/use-application.js';
import {Effect} from '../src/lib/effect.js';
import type {Reducer} from '../src/lib/types.js';
it('definition is inert and rejects structural fake compositions',()=>{
 const factory=vi.fn((value:number)=>({value}));const startup=vi.fn(()=>({type:'start' as const}));
 const reducer:Reducer<{value:number},{type:'start'},{}>=state=>[state,Effect.none()];
 const definition=defineApplication(reducer,{initialState:factory,startup});expect(Object.isFrozen(definition)).toBe(true);expect(factory).not.toHaveBeenCalled();expect(startup).not.toHaveBeenCalled();
 expect(()=>Reflect.apply(defineApplication,undefined,[{reducer,execution:{mode:'legacy'}},{initialState:factory}])).toThrow('managed composition');
});
it('invalid component call fails before invoking application factory',()=>{
 const initialState=vi.fn((value:number)=>({value}));const reducer:Reducer<{value:number},{type:'noop'},{}>=state=>[state,Effect.none()];const definition=defineApplication(reducer,{initialState});
 expect(()=>useApplication(definition)).toThrow();expect(initialState).not.toHaveBeenCalled();
});
it('rejects forged definitions and ambiguous runtime initial values',()=>{
 const reducer:Reducer<number,{type:'noop'},{}>=state=>[state,Effect.none()];const definition=defineApplication(reducer,{initialState:(n:number)=>n});
 expect(()=>Reflect.apply(useApplication,undefined,[{}])).toThrow('defineApplication');
 expect(()=>Reflect.apply(createApplication,undefined,[definition,{dependencies:{},initial:{state:0,input:1}}])).toThrow('exactly one');
});

it('rejects obsolete construction arguments rather than silently ignoring them',()=>{const initialState=vi.fn((count:number)=>({count}));const definition=defineApplication<{count:number},{type:'noop'},undefined,number>(state=>[state,Effect.none()],{initialState});expect(()=>Reflect.apply(useApplication,undefined,[definition,{dependencies:undefined,initial:{input:1}}])).toThrow('construct it with ApplicationRoot');expect(initialState).not.toHaveBeenCalled();});
