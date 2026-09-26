<script lang="ts">
 import ModalPrimitive from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import SheetPrimitive from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
 import DrawerPrimitive from '../../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
 import AlertPrimitive from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
 import type{PresentationState}from'../../src/lib/navigation/types';
 let {kind,onComplete}:{kind:'modal'|'sheet'|'drawer'|'alert';onComplete:(event:string)=>void}=$props();
 const Selected=$derived({modal:ModalPrimitive,sheet:SheetPrimitive,drawer:DrawerPrimitive,alert:AlertPrimitive}[kind]);
 let shown=$state(true);let presentation=$state<PresentationState<string>>({status:'presenting',content:'first',duration:20});
 let config=$state({visualDuration:0.02,bounce:0});
 export function hide(){shown=false;}
 export function replace(content:string){presentation={status:'presenting',content,duration:20};}
 export function dismiss(){presentation={status:'dismissing',content:'first',duration:20};}
 export function updateConfig(){config={visualDuration:0.03,bounce:0};}
 function completed(event:string){onComplete(`${event}:${presentation.status==='idle'?'idle':presentation.content}`);}
</script>
{#if shown}
 <Selected store={undefined} {presentation} springConfig={config} onPresentationComplete={()=>completed('presented')} onDismissalComplete={()=>completed('dismissed')}>
  {#snippet children({bindBackdrop,bindContent,initialOpacity})}
   <div data-lifetime-backdrop use:bindBackdrop style:opacity={initialOpacity} style="position:fixed;inset:0;background:rgba(0,0,0,.5)"></div>
   <div data-lifetime-content use:bindContent style:opacity={initialOpacity} style="position:fixed;left:50%;top:50%;width:140px;height:100px;background:white"><button>Content</button></div>
  {/snippet}
 </Selected>
{/if}
