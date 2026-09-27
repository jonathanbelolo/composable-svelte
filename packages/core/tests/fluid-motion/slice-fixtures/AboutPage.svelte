<script lang="ts">
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
 void store;
 const participant = useParticipant();
</script>
<section data-page="about"><div data-hero="about" use:participant={{ key: 'hero' }} style="display:block;width:60px;height:60px;background:rgb(30,60,120)">A</div></section>
