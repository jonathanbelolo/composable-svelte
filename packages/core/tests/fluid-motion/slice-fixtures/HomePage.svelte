<script lang="ts">
 import { useStagedRoute } from '../../../src/lib/application/index.js';
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 import { definition, requesters } from './SliceModel.js';
 let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
 void store;
 requesters.push({ where: 'home', requester: useStagedRoute(definition) });
 const participant = useParticipant();
</script>
<main data-page="home">
 <div data-hero="home" use:participant={{ key: 'hero' }} style="display:block;width:240px;height:90px;background:rgb(30,60,120);color:white">Hero</div>
 <p data-body use:participant={{ key: 'body' }}>Home body text that fades out while the hero travels.</p>
</main>
