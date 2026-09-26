<script lang="ts">
 import {useSvelteFlow} from '@xyflow/svelte';
 import {onMount} from 'svelte';
 import {graphProbe} from './graph-probe';
 let {id}: {id:string}=$props();
 const flow=useSvelteFlow();
 onMount(()=>{graphProbe.getNode=(id)=>flow.getNode(id);return()=>{graphProbe.getNode=null;};});
</script>
<div style="width:100px;height:40px;background:gray">Node {id}</div>
