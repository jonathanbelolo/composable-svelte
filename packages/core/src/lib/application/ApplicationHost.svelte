<script lang="ts">
 import {onMount,onDestroy,untrack,type Snippet} from 'svelte';
 import type {RendererOwner} from './renderer/owner.js';
 import {provideRegistry} from './renderer/context.js';
 import {getApplicationInternal,type ApplicationOwner} from './instance.svelte.js';
 // `owner` remains an internal compatibility path; public wrapper requires app.
 let {app,owner,children}:({app:ApplicationOwner;owner?:undefined}|{owner:RendererOwner;app?:undefined})&{children:Snippet}=$props();
 const resolved=untrack(()=>{
  if(app!==undefined&&owner!==undefined)throw new TypeError('Provide app or owner, not both');
  const internal=app===undefined?undefined:getApplicationInternal(app);
  const selected=internal?.owner??owner;
  if(!selected)throw new TypeError('ApplicationHost requires an owner');
  return {internal,claim:selected.claim()};
 });
 const {claim,internal}=resolved;
 $effect.pre(()=>()=>claim.release());
 provideRegistry(claim.registry);
 onMount(()=>{try{claim.attach();}catch(error){claim.release();internal?.destroy();throw error;}});
 onDestroy(()=>claim.release());
 const guarded:Snippet=(...args:Parameters<Snippet>)=>{
  try{return Reflect.apply(children,undefined,args);}
  catch(error){claim.release();internal?.destroy();throw error;}
 };
</script>
{@render guarded()}
