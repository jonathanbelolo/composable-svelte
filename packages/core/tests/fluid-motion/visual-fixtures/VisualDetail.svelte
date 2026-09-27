<script lang="ts">
 import { useStagedRoute } from '../../../src/lib/application/index.js';
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 import { definition, requesters, logoSrc } from './VisualModel.js';
 let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
 void store;
 requesters.push({ where: 'detail', requester: useStagedRoute(definition) });
 const participant = useParticipant();
</script>
<header data-page="detail">
 <a data-hero-link href="/" use:participant={{ key: 'hero', role: 'control' }} style="display:block;width:120px;height:40px;margin-left:300px;background:rgb(30,60,120);color:white">Home</a>
</header>
<div data-logo use:participant={{ key: 'logo' }} style="display:block;width:80px;height:80px;margin-left:200px"><img alt="" src={logoSrc} style="display:block;width:80px;height:80px"></div>
<h1 data-route-title data-route-focus>Details</h1>
<!-- Explicit tab order: WebKit's native heading-to-button Tab differs without any Host (portability). -->
<button data-detail-action type="button" tabindex="0">Act</button>
<p data-intro use:participant={{ key: 'intro' }}>Detail intro</p>
