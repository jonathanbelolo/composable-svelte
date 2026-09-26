<script lang="ts">
 import Input from '../../src/lib/components/ui/input/Input.svelte';
 let { dispatch }: {dispatch:(action:unknown)=>void}=$props();
 let value: string | number=$state('');
 let badInput=$state(false);
</script>
<Input type="number" bind:value bind:badInput action={{type:'changed'}} {dispatch} />
<output data-value>{JSON.stringify(value)}</output>
<output data-validity>{JSON.stringify(badInput)}</output>
