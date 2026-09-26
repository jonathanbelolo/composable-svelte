<script lang="ts">
 import AuthGuard from '../../src/lib/components/AuthGuard.svelte';
 import type {SessionState} from '../../src/lib/session/types.js';
 let {store,onAnonymous}:{store:{readonly state:SessionState},onAnonymous:()=>void}=$props();
 let incidental=$state(0);
 export function bump(){incidental++;}
 function callback(){void incidental;onAnonymous();}
</script>
<AuthGuard {store} onAnonymous={callback}/>
