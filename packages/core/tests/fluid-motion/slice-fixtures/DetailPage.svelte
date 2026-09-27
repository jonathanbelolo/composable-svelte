<script lang="ts">
 import { useStagedRoute } from '../../../src/lib/application/index.js';
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 import { definition, requesters } from './SliceModel.js';
 let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
 void store;
 requesters.push({ where: 'detail', requester: useStagedRoute(definition) });
 const participant = useParticipant();
</script>
<header data-page="detail">
 <div data-hero="detail" use:participant={{ key: 'hero' }} style="display:block;width:120px;height:40px;margin-left:300px;background:rgb(30,60,120);color:white">Hero</div>
</header>
<p data-intro use:participant={{ key: 'intro' }}>Detail intro that enters after commit.</p>
