<script lang="ts">
 import { useStagedRoute } from '../../../src/lib/application/index.js';
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 import { definition, requesters } from './VisualModel.js';
 let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
 void store;
 requesters.push({ where: 'card', requester: useStagedRoute(definition) });
 const participant = useParticipant();
</script>
<main data-page="card">
 <section data-card-expanded use:participant={{ key: 'card' }} style="display:block;width:600px;height:400px;background:rgb(200,120,40)">
  <h2>Expanded card</h2>
  <button data-collapse type="button">Collapse</button>
 </section>
</main>
