<script lang="ts">
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 const participant = useParticipant();
</script>
<div data-embed use:participant={{ key: 'embed' }} style="display:block;width:160px;height:60px;background:#0f172a"><canvas data-live width="16" height="8" style="width:160px;height:60px"></canvas></div>
