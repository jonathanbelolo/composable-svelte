<script lang="ts">
 import Bomb from './Bomb.svelte';
 let { url }: { url: string } = $props();
</script>
<nav data-shell>{url}{#if url === '/shell-bomb'}<Bomb kind="shell"/>{/if}</nav>
