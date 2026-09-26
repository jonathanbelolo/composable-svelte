<script lang="ts">
 import Modal from '../../src/lib/navigation-components/Modal.svelte';
 import ModalPrimitive from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import NavigationStack from '../../src/lib/navigation-components/NavigationStack.svelte';
 import {createStore} from '../../src/lib/store.svelte.js';
 import {Effect} from '../../src/lib/effect.js';
 import {
  ManagedIntegrationBuilder,
  optionalSlot
 } from '../../src/lib/navigation/managed-integration.js';
 import type { PresentationAction } from '../../src/lib/navigation/types.js';
 import type { Reducer } from '../../src/lib/types.js';
 import {onDestroy} from 'svelte';
 let {mode='modal',onBack=()=>{}}:{mode?:'modal'|'primitive'|'stack';onBack?:()=>void}=$props();
 type Child={id:string};
 type ChildAction=Record<string,never>;
 type State={destination:Child|null;dismissals:number};
 type Action={type:'show'}|{type:'hide'}|{type:'destination';action:PresentationAction<ChildAction>};
 const destinationSlot=optionalSlot<State,Action>()('destination');
 const reducer:Reducer<State,Action>=(state,action)=>{
  if(action.type==='show')return[{...state,destination:{id:'live'}},Effect.none()];
  if(action.type==='hide')return[{...state,destination:null},Effect.none()];
  if(action.type==='destination'&&action.action.type==='dismiss')return[{...state,destination:{id:'live'},dismissals:state.dismissals+1},Effect.none()];
  return[state,Effect.none()];
 };
 const childReducer:Reducer<Child,ChildAction>=(state)=>[state,Effect.none()];
 const composition=new ManagedIntegrationBuilder<State,Action,undefined>(reducer).with(destinationSlot,childReducer).build();
 const parent=createStore({initialState:{destination:{id:'live'},dismissals:0},...composition});
 const view=$derived(composition.bind(parent,destinationSlot));
 let absent=$state(false);let disabled=$state(true);let revision=$state(0);let screens=$state<readonly {id:string}[]>([{id:'one'},{id:'two'}]);
 export function setDisabled(value:boolean){disabled=value;}
 export function replaceContent(){revision++;}
 export function setAbsent(value:boolean){absent=value;}
 export function hide(){parent.dispatch({type:'hide'});}
 export function show(){parent.dispatch({type:'show'});}
 export function setScreens(value:readonly {id:string}[]){screens=value;}
 export function dismissals(){return parent.state.dismissals;}
 onDestroy(()=>parent.destroy());
</script>
<button data-testid="outside">Outside</button>
{#if mode==='modal'}
 <Modal store={absent?undefined:view} disableClickOutside={disabled} ariaLabel="Boundary modal">
  <button data-testid="inside">Inside</button>
 </Modal>
{:else if mode==='primitive'}
 <ModalPrimitive store={absent?undefined:view} disableClickOutside={disabled}>
  {#snippet children({bindContent})}
   {#key revision}<div use:bindContent data-testid="replaceable"><button>Inside</button></div>{/key}
  {/snippet}
 </ModalPrimitive>
{:else}
 <NavigationStack store={absent?undefined:view} stack={screens} {onBack}/>
{/if}
