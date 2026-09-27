<script lang="ts">
 import { useStagedRoute } from '../../../src/lib/application/index.js';
 import { definition, requesters } from './SliceModel.js';
 requesters.push({ where: 'shell', requester: useStagedRoute(definition) });
</script>
<nav data-shell>Shell</nav>
