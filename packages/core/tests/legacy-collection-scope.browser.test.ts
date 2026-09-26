import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { createStore } from '../src/lib/store.svelte.js';
import { Effect } from '../src/lib/effect.js';
import { scopeToElement } from '../src/lib/navigation/scope-to-element.js';
import LegacyCollectionScope from './fixtures/LegacyCollectionScope.svelte';
it('retains a renderable final snapshot between collection removal and child teardown', async () => {
 const store = createStore({initialState: {items: [{id:'a', state:{count:7}}]}, reducer: (state, action: {type:'remove'}) => [{...state,items:state.items.filter(() => false)}, Effect.none()] as const, dependencies:{}});
 const child = scopeToElement<{type:'increment'}>(store, 'child', state=>state.items,'a')!;
 const target=document.createElement('div');document.body.appendChild(target);
 const instance=mount(LegacyCollectionScope,{target,props:{store:child}});
 try {
  flushSync();expect(target.textContent).toContain('7');
  store.dispatch({type:'remove'});
  expect(()=>flushSync()).not.toThrow();
  expect(target.textContent).toContain('7');
 } finally {await unmount(instance);store.destroy();target.remove();}
});
