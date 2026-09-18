import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import {renderToHTML, parseState} from '@composable-svelte/core/ssr';
import View from './ServerView.svelte';
const reducer:Reducer<{count:number},{type:'increment'}>=(state)=>[{count:state.count+1},Effect.none()];
const store=createStore({initialState:{count:7},reducer});
const html=renderToHTML(View,{store});
if(!html.includes('SSR count 7'))throw new Error('SSR output missing');
console.log('SSR render succeeded:',html.length,'bytes');
