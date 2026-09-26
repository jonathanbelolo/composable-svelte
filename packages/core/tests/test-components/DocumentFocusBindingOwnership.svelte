<script lang="ts">
 import {onDestroy} from 'svelte';
 import Alert from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
 import Popover from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
 import {Effect} from '../../src/lib/effect.js';
 import {createStore} from '../../src/lib/store.svelte.js';
 import {ManagedIntegrationBuilder,optionalSlot} from '../../src/lib/navigation/managed-integration.js';
 import type {PresentationAction,PresentationState} from '../../src/lib/navigation/types.js';
 import type {Reducer} from '../../src/lib/types.js';
 // PKT-8 (DF-16) only: manual mode hands the primitive's bind callbacks to the test; managed mode lets Svelte own the returned actions.
 type Bound=void|{destroy?:()=>void};type Bind=(node:HTMLElement)=>Bound;type Slot='content'|'backdrop';
 let {kind,managed=false}:{kind:'alert'|'popover';managed?:boolean}=$props();
 type Child=Record<string,never>;type ChildAction={type:'noop'};
 type Root={overlay:Child|null;dismissed:number};type RootAction={type:'overlay';action:PresentationAction<ChildAction>};
 const slot=optionalSlot<Root,RootAction>()('overlay');
 const reducer:Reducer<Root,RootAction>=(state,action)=>action.action.type==='dismiss'?[{...state,overlay:{},dismissed:state.dismissed+1},Effect.none()]:[state,Effect.none()];
 const childReducer:Reducer<Child,ChildAction>=(state)=>[state,Effect.none()];
 const composition=new ManagedIntegrationBuilder<Root,RootAction,undefined>(reducer).with(slot,childReducer).build();
 const root=createStore({initialState:{overlay:{},dismissed:0},...composition});
 onDestroy(()=>root.destroy());
 const store=$derived(composition.bind(root,slot));
 let presentation=$state<PresentationState<string>>({status:'presented',content:'overlay'});
 let second=$state({content:true,backdrop:true});let binders:{content:Bind;backdrop:Bind|undefined}|undefined;
 const capture=(_node:HTMLElement,next:NonNullable<typeof binders>)=>{binders=next;};const attach=(node:HTMLElement,bind:Bind|undefined):Bound=>bind?.(node);
 export function phase(status:'presenting'|'presented'|'dismissing'){presentation={status,content:'overlay'};}
 export function bind(slot:Slot,node:HTMLElement):{destroy:()=>void}{const bound=binders?.[slot]?.(node);if(typeof bound!=='object'||typeof bound.destroy!=='function')throw new Error(`${kind} ${slot} binding returned no destroy action`);return{destroy:bound.destroy};}
 export function removeSecond(slot:Slot){second[slot]=false;}
 export function dismissals(){return root.state.dismissed;}
</script>
{#snippet body(bindContent:Bind,bindBackdrop:Bind|undefined)}
 <span hidden use:capture={{content:bindContent,backdrop:bindBackdrop}}></span>
 <div data-ownership-backdrop="a" use:attach={managed?bindBackdrop:undefined}></div>
 <section data-ownership-content="a" use:attach={managed?bindContent:undefined}><button>Content A</button></section>
 {#if second.backdrop}<div data-ownership-backdrop="b" use:attach={managed?bindBackdrop:undefined}></div>{/if}
 {#if second.content}<section data-ownership-content="b" use:attach={managed?bindContent:undefined}><button>Content B</button></section>{/if}
{/snippet}
{#if kind==='alert'}
 <Alert {store} {presentation}>
  {#snippet children({bindContent,bindBackdrop})}{@render body(bindContent,bindBackdrop)}{/snippet}
 </Alert>
{:else}
 <Popover {store} {presentation}>
  {#snippet children({bindContent})}{@render body(bindContent,undefined)}{/snippet}
 </Popover>
{/if}
