<script lang="ts">
 import { Presence, useLayoutChoreography } from '../../../src/lib/application/motion-public.js';
 import type { ApplicationStore } from '../../../src/lib/application/index.js';
 import { hooks, type VideoState, type VideoAction } from './VideoModel.js';
 import VideoCard from './VideoCard.svelte';
 let { store }: { store: ApplicationStore<VideoState, VideoAction> } = $props();
 const layout = useLayoutChoreography();
 hooks.transition = (plan, action) => layout.transition(plan, () => store.dispatch(action));
</script>
<Presence when={store.state.show}><VideoCard /></Presence>
