<script lang="ts">
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { Button } from '@composable-svelte/core/components/ui';
import ChartExample from './charts-1.svelte';
import AuthExample from './Auth.svelte';
import Editor from './code-4.svelte';
import Highlight from './code-2.svelte';
import Chat from './chat-3.svelte';
import Audio from './media-2.svelte';
type A={type:'increment'}|{type:'load'}|{type:'loaded';value:number};
const reducer:Reducer<{count:number;loading:boolean},A,{load:()=>Promise<number>}>=(s,a,d)=>{
 switch(a.type){
 case 'increment':return [{...s,count:s.count+1},Effect.none()];
 case 'load':return [{...s,loading:true},Effect.run(async dispatch=>dispatch({type:'loaded',value:await d.load()}))];
 case 'loaded':return [{count:a.value,loading:false},Effect.none()];
 }
};
const store=createStore({initialState:{count:0,loading:false},reducer,dependencies:{load:async()=>42}});
</script>
<h1>External consumer</h1>
<p data-testid="count">{store.state.count}</p>
<Button onclick={()=>store.dispatch({type:'increment'})}>Increment</Button>
<Button onclick={()=>store.dispatch({type:'load'})}>Load</Button>
<Button onclick={()=>document.documentElement.classList.toggle('dark')}>Theme</Button>
<ChartExample/><AuthExample/><Highlight/><Editor/><Chat/><Audio/>
