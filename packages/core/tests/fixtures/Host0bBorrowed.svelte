<script lang="ts">
 import ApplicationHost from '../../src/lib/application/ApplicationHost.svelte';
 import type {RendererOwner} from '../../src/lib/application/renderer/owner.js';
 let {owner,fail=false}:{owner:RendererOwner;fail?:boolean}=$props();
 function explode():never{throw new Error('child setup failed');}
</script>
<ApplicationHost {owner}><span>{fail?explode():'borrowed'}</span></ApplicationHost>
