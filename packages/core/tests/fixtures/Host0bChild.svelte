<script lang="ts">
 import {useRegistry} from '../../src/lib/application/renderer/context.js';
 import type {ChildView} from '../../src/lib/navigation/managed-integration.js';
 import {target,type Child,type ChildAction} from './Host0bModel.js';
 let {view,onEvent=()=>{}}:{view:ChildView<Child,ChildAction>;onEvent?:(value:string)=>void}=$props();
 const registry=useRegistry();
 function register(node:HTMLElement){
  onEvent(`register:${registry.isAttached}`);
  const handle=registry.register(view,target,node,{opacity:view.state?.opacity??'0'});
  return {destroy(){handle.release();onEvent('unregister');}};
 }
</script>
<div data-target style:opacity={view.state?.opacity??'0'} use:register>Stable content</div>
