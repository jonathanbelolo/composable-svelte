<script lang="ts">
 /**
  * Candidate public: an explicitly placed stable plane outlet for route choreography representations.
  * Without it, the document-level default plane is used. An outlet inside a transformed, filtered,
  * perspective or contained ancestor is not a qualified coordinate space and falls back (diagnosed).
  */
 import {optionalRouteHost} from './renderer/choreography/route-host.js';
 const host=optionalRouteHost();
 const outlet=(node:HTMLElement)=>{host?.setPlaneOutlet(node);return{destroy(){host?.setPlaneOutlet(undefined);}};};
</script>
<div data-composable-motion-plane-outlet use:outlet></div>
