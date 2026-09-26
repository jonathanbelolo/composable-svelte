<script lang="ts">
 import type {Snippet} from 'svelte';
 import type {ApplicationOwner} from './instance.svelte.js';
 import Host from './ApplicationHost.svelte';
 let {app,children}:{app:ApplicationOwner;children:Snippet}=$props();
</script>
<Host {app} {children}/>
