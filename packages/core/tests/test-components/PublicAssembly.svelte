<script lang="ts">
 import {onDestroy} from 'svelte';
 import {z} from 'zod';
 import Form from '../../src/lib/components/form/Form.svelte';
 import FormField from '../../src/lib/components/form/FormField.svelte';
 import {createFormReducer,createInitialFormState} from '../../src/lib/components/form/form.reducer.js';
 import Accordion from '../../src/lib/components/ui/accordion/Accordion.svelte';
 import AccordionItem from '../../src/lib/components/ui/accordion/AccordionItem.svelte';
 import AccordionTrigger from '../../src/lib/components/ui/accordion/AccordionTrigger.svelte';
 import AccordionContent from '../../src/lib/components/ui/accordion/AccordionContent.svelte';
 import Probe from './AccordionAssemblyProbe.svelte';
 import {createStore} from '../../src/lib/store.svelte.js';
 import type {Store} from '../../src/lib/types.js';
 import type {AccordionState,AccordionAction,AccordionItem as Item} from '../../src/lib/components/ui/accordion/accordion.types.js';
 let {ready=()=>{},expanded=()=>{}}:{ready?:(store:Store<AccordionState,AccordionAction>)=>void;expanded?:(id:string)=>void}=$props();
 let disabled=$state(false), second=$state(true), businessId=$state('first');
 let items:Item[]=$state([{id:'shared',title:'Declared',content:'Declared body'},{id:'blocked',title:'Disabled',content:'Blocked body',disabled:true}]);
 const config={schema:z.object({user:z.object({name:z.string()}),rows:z.array(z.object({label:z.string()}))}),initialData:{user:{name:'Ada'},rows:[{label:'First'}]},onSubmit:async()=>{}};
 const form=createStore({initialState:createInitialFormState(config),reducer:createFormReducer(config),dependencies:{}});
 onDestroy(()=>form.destroy());
 export function editNested(){form.dispatch({type:'fieldChanged',field:'user.name',value:'Grace'});form.dispatch({type:'fieldChanged',field:'rows.0.label',value:'Changed'});}
 export function setDisabled(value:boolean){disabled=value;}
 export function setSecond(value:boolean){second=value;}
 export function changeId(value:string){businessId=value;}
 export function replaceItems(value:Item[]){items=value;}
</script>
<Form store={form}>
 <FormField name="user.name">{#snippet children({field})}<span data-value="name">{String(field.value)}</span>{/snippet}</FormField>
 <FormField name="rows.0.label">{#snippet children({field})}<span data-value="array">{String(field.value)}</span>{/snippet}</FormField>
</Form>
<section data-declarative><Accordion {items} onExpand={expanded}/></section>
<section data-composed>
 <Accordion initialExpandedIds={['first']}>
  <Probe {ready}/>
  <AccordionItem id={businessId} {disabled}><AccordionTrigger>Composed first</AccordionTrigger><AccordionContent>First body</AccordionContent></AccordionItem>
  {#if second}<AccordionItem id="second"><AccordionTrigger>Composed second</AccordionTrigger><AccordionContent>Second body</AccordionContent></AccordionItem>{/if}
  <AccordionItem id="blocked" disabled><AccordionTrigger>Composed disabled</AccordionTrigger><AccordionContent>Disabled body</AccordionContent></AccordionItem>
 </Accordion>
</section>
<section data-other><Accordion items={[{id:'shared',title:'Other',content:'Other body'}]}/></section>
<section data-precedence><Accordion items={[{id:'unused',title:'Must not render',content:'Unused'}]}><AccordionItem id="custom"><AccordionTrigger>Custom snippet</AccordionTrigger><AccordionContent>Custom body</AccordionContent></AccordionItem></Accordion></section>
