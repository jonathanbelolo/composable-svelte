<script lang="ts">
 import {onMount} from 'svelte';
 import type {Action} from 'svelte/action';
 import {useRegistry,useTargetOwner} from '../../src/lib/application/renderer/context.js';
 import type {MotionBinding} from '../../src/lib/application/renderer/target-registry.js';
 import type {MotionRunContext,MotionRun} from '../../src/lib/application/renderer/motion-run.js';
 import {bindings,contexts,runs,registries,noteInitialized} from './ArbitrationModel.js';
 import type {FeatureViewProps} from '../../src/lib/application/index.js';
 let {store,surface}:FeatureViewProps<{value:number},{type:'increment'}>=$props();
 const registry=useRegistry(),owner=useTargetOwner();registries.push(registry);noteInitialized();let binding:MotionBinding|undefined;
 const target:Action<HTMLElement>=(node)=>{
  binding=registry.bind(owner,[{name:'surface',node,properties:['opacity'],stable:{opacity:'1'}}],{channel:'micro',priority:0});bindings.push(binding);return{destroy(){binding?.release();}};
 };
 onMount(()=>{const b=binding!;const start=()=>runs.push(b.start({deadlineMs:10000,stable(){},execute(context){contexts.push(context);b.lease('surface','opacity',context).write('0.4');return new Promise(()=>{});}}));queueMicrotask(()=>{if(b.live)start();});});
</script>
<span data-motion-leaf use:surface use:target>motion</span>
