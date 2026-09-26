<script lang="ts">
 import Input from '../../src/lib/components/ui/input/Input.svelte';
 let { dispatch }: {dispatch:(action:unknown)=>void}=$props();
 let value: string | number=$state('');
</script>
<Input type="number" bind:value action={{type:'changed'}} {dispatch} />
<output>{JSON.stringify(value)}</output>
