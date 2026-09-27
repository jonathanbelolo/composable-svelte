<script lang="ts">
 import { useRepresentationProvider } from '../../../src/lib/application/motion-public.js';
 import { hooks } from './PresenceModel.js';
 hooks.lookupOutside = useRepresentationProvider('probe') ?? null;
</script>
<span>outside</span>
