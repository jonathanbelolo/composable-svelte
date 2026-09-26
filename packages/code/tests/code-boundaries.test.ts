import {describe,it,expect} from 'vitest';
import {nodeCanvasReducer} from '../src/lib/node-canvas/reducer';
import {createInitialNodeCanvasState,type NodeTypeDefinition} from '../src/lib/node-canvas/types';
import {createConnectionValidator} from '../src/lib/node-canvas/validation';
import {createInitialState} from '../src/lib/code-editor/code-editor.types';
import {highlightCode} from '../src/lib/code-highlight/prism-wrapper';
const node=(id:string)=>({id,type:'operation',position:{x:0,y:0},data:{}});
it('removing a node retires incident edge selections but retains unrelated selections',()=>{
 const initial=createInitialNodeCanvasState({nodes:{a:node('a'),b:node('b'),c:node('c')},edges:{ab:{id:'ab',source:'a',target:'b'},bc:{id:'bc',source:'b',target:'c'}}});initial.selectedNodes=new Set(['a','c']);initial.selectedEdges=new Set(['ab','bc']);
 const[next]=nodeCanvasReducer(initial,{type:'removeNode',nodeId:'a'});expect([...next.selectedEdges]).toEqual(['bc']);expect([...next.selectedNodes]).toEqual(['c']);expect(Object.keys(next.edges)).toEqual(['bc']);expect([...initial.selectedEdges]).toEqual(['ab','bc']);
});
const type:NodeTypeDefinition={type:'operation',label:'Operation',inputs:[{id:'in',label:'Input',dataType:'number',multiple:false}],outputs:[{id:'out',label:'Output',dataType:'number',multiple:false}]};
describe('default handles resolve to actual port identity',()=>{
 it.each([null,undefined,'in'])('target existing handle %s prevents duplicate default connection',handle=>{
  const state=createInitialNodeCanvasState({nodes:{a:node('a'),b:node('b'),c:node('c')},edges:{ab:{id:'ab',source:'a',target:'b',...(handle===undefined?{}:{targetHandle:handle}),sourceHandle:'out'}}});
  expect(createConnectionValidator({operation:type})(state,'c','out','b',null).valid).toBe(false);
 });
 it.each([null,undefined,'out'])('source existing handle %s prevents duplicate named connection',handle=>{
  const state=createInitialNodeCanvasState({nodes:{a:node('a'),b:node('b'),c:node('c')},edges:{ab:{id:'ab',source:'a',target:'b',...(handle===undefined?{}:{sourceHandle:handle}),targetHandle:'in'}}});
  expect(createConnectionValidator({operation:type})(state,'a','out','c','in').valid).toBe(false);
 });
 it('a connection on a distinct named port does not occupy the default port',()=>{
  const definition={...type,inputs:[...type.inputs!,{id:'other',label:'Other',dataType:'number',multiple:false}]};const state=createInitialNodeCanvasState({nodes:{a:node('a'),b:node('b'),c:node('c')},edges:{ab:{id:'ab',source:'a',target:'b',sourceHandle:'out',targetHandle:'other'}}});expect(createConnectionValidator({operation:definition})(state,'c','out','b',null).valid).toBe(true);
 });
 it('multiple ports allow more than one connection',()=>{
  const definition={...type,inputs:[{...type.inputs![0]!,multiple:true}],outputs:[{...type.outputs![0]!,multiple:true}]};const state=createInitialNodeCanvasState({nodes:{a:node('a'),b:node('b'),c:node('c')},edges:{ab:{id:'ab',source:'a',target:'b'}}});expect(createConnectionValidator({operation:definition})(state,'a',null,'c',null).valid).toBe(true);
 });
});
it('editor factory accepts omitted optional configuration without changing explicit options',()=>{expect(createInitialState()).toEqual(createInitialState({}));expect(createInitialState({value:'x',readOnly:true,tabSize:4})).toMatchObject({value:'x',readOnly:true,tabSize:4});});
it('Svelte highlighting emits grammar tokens while preserving escaped source content',async()=>{const htmlBefore=await highlightCode('<script>let value: number = 1;</script>','html');const output=await highlightCode('<script lang="ts">let count: number = 0;</script>\n{#if count}<button>{count}</button>{/if}','svelte');expect(output).toContain('token');expect(output).toContain('&lt;');expect(output).not.toContain('<script');expect(output).toContain('count');expect(output).toContain('token builtin');expect(await highlightCode('<script>let value: number = 1;</script>','html')).toBe(htmlBefore);});
