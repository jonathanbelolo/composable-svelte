import{afterEach,it,expect,vi}from'vitest';
import{mount,unmount,flushSync}from'svelte';
import type{EditorView}from'@codemirror/view';
import{createStore}from'@composable-svelte/core';
import{codeEditorReducer}from'../src/lib/code-editor/code-editor.reducer';
import{createInitialState}from'../src/lib/code-editor/code-editor.types';
const gate=vi.hoisted(()=>({view:null as EditorView|null,resolve:null as (()=>void)|null,reject:null as ((error:Error)=>void)|null}));
vi.mock('../src/lib/code-editor/codemirror-wrapper',async importOriginal=>{
 const actual=await importOriginal<typeof import('../src/lib/code-editor/codemirror-wrapper')>();
 return{...actual,createEditorView:async(...args:Parameters<typeof actual.createEditorView>)=>{
  const view=await actual.createEditorView(...args);gate.view=view;return new Promise<EditorView>((resolve,reject)=>{gate.resolve=()=>resolve(view);gate.reject=reject;});
 }};
});
import CodeEditor from'../src/lib/code-editor/CodeEditor.svelte';
afterEach(()=>{gate.view?.destroy();gate.view=null;gate.resolve=null;gate.reject=null;vi.restoreAllMocks();});
it('destroys actual late-created EditorView and performs no catch-up after unmount',async()=>{
 const store=createStore({initialState:createInitialState({value:'const initial = 1;'}),reducer:codeEditorReducer,dependencies:{}});const target=document.createElement('div');document.body.append(target);const component=mount(CodeEditor,{target,props:{store}});flushSync();await vi.waitFor(()=>expect(gate.view).not.toBeNull());const destroy=vi.spyOn(gate.view!,'destroy');const dispatch=vi.spyOn(gate.view!,'dispatch');await unmount(component);store.dispatch({type:'valueChanged',value:'changed while absent'});gate.resolve!();await vi.waitFor(()=>expect(destroy).toHaveBeenCalledTimes(1));expect(dispatch).not.toHaveBeenCalled();store.destroy();target.remove();
});
it('live asynchronous initialization catches up to current store and destroys normally',async()=>{
 const store=createStore({initialState:createInitialState({value:'initial'}),reducer:codeEditorReducer,dependencies:{}});const target=document.createElement('div');document.body.append(target);const component=mount(CodeEditor,{target,props:{store}});flushSync();await vi.waitFor(()=>expect(gate.view).not.toBeNull());store.dispatch({type:'valueChanged',value:'current'});const destroy=vi.spyOn(gate.view!,'destroy');gate.resolve!();await vi.waitFor(()=>expect(gate.view!.state.doc.toString()).toBe('current'));await unmount(component);expect(destroy).toHaveBeenCalledTimes(1);store.destroy();target.remove();
});
