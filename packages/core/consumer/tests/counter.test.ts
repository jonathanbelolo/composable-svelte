import { it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { reducer } from '../src/counter';
it('uses the injected dependency and receives its result', async()=>{
  const store=createTestStore({initialState:{count:0,loading:false},reducer,dependencies:{load:async()=>42}});
  await store.send({type:'load'},s=>expect(s.loading).toBe(true));
  await store.receive({type:'loaded',value:42},s=>expect(s).toEqual({count:42,loading:false}));
  await store.finish();
});
it('clears loading when an injected dependency fails', async()=>{
  const store=createTestStore({initialState:{count:0,loading:false},reducer,dependencies:{load:async()=>{throw new Error('offline');}}});
  await store.send({type:'load'});
  await store.receive({type:'failed'},s=>expect(s).toEqual({count:0,loading:false}));
  await store.finish();
});
