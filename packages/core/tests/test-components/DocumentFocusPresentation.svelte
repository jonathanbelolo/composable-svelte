<script lang="ts">
 import {onDestroy} from 'svelte';
 import Modal from '../../src/lib/navigation-components/primitives/ModalPrimitive.svelte';
 import Sheet from '../../src/lib/navigation-components/primitives/SheetPrimitive.svelte';
 import Drawer from '../../src/lib/navigation-components/primitives/DrawerPrimitive.svelte';
 import Alert from '../../src/lib/navigation-components/primitives/AlertPrimitive.svelte';
 import Popover from '../../src/lib/navigation-components/primitives/PopoverPrimitive.svelte';
 import {Effect} from '../../src/lib/effect.js';
 import {createStore} from '../../src/lib/store.svelte.js';
 import {ManagedIntegrationBuilder,optionalSlot,type PresentationView} from '../../src/lib/navigation/managed-integration.js';
 import type {PresentationAction,PresentationState} from '../../src/lib/navigation/types.js';
 import type {Reducer} from '../../src/lib/types.js';
 let {kind}:{kind:'modal'|'sheet'|'drawer'|'alert'|'popover'}=$props();
 const Selected=$derived({modal:Modal,sheet:Sheet,drawer:Drawer,alert:Alert,popover:Popover}[kind]);
 type Child=Record<string,never>;type ChildAction={type:'noop'};
 type Root={overlay:Child|null};
 type RootAction={type:'overlay';action:PresentationAction<ChildAction>}|{type:'clear'}|{type:'replace'};
 const slot=optionalSlot<Root,RootAction>()('overlay');
 const reducer:Reducer<Root,RootAction>=(state,action)=>action.type==='clear'?[{overlay:null},Effect.none()]:action.type==='replace'?[{overlay:{}},Effect.none()]:[state,Effect.none()];
 const childReducer:Reducer<Child,ChildAction>=(state)=>[state,Effect.none()];
 const composition=new ManagedIntegrationBuilder<Root,RootAction,undefined>(reducer).with(slot,childReducer,{replaceOn:action=>action.type==='replace'}).build();
 const root=createStore({initialState:{overlay:{}},...composition});onDestroy(()=>root.destroy());
 let store=$state.raw<PresentationView<Child,ChildAction>|undefined>(composition.bind(root,slot));
 const sync=()=>{store=composition.bind(root,slot);};
 let presentation=$state<PresentationState<string>|undefined>({status:'presented',content:'overlay'});
 export function phase(status:'presenting'|'presented'|'dismissing'){presentation={status,content:'overlay'};}
 export function clearStore(){root.dispatch({type:'clear'});sync();}
 export function replaceOwner(){root.dispatch({type:'replace'});sync();}
</script>
<Selected {store} {presentation}>
 {#snippet children({bindContent})}
  <div use:bindContent data-overlay><button data-overlay-first>First</button><button>Last</button></div>
 {/snippet}
</Selected>
