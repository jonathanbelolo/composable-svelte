<script lang="ts">
 import { Presence, useLayoutChoreography } from '../../../src/lib/application/motion-public.js';
 import type { ApplicationStore } from '../../../src/lib/application/index.js';
 import { hooks, type PresenceState, type PresenceAction } from './PresenceModel.js';
 import EmbedChild from './EmbedChild.svelte';
 let { store }: { store: ApplicationStore<PresenceState, PresenceAction> } = $props();
 const layout = useLayoutChoreography();
 hooks.transition = (plan, action) => layout.transition(plan, () => store.dispatch(action));
</script>
<Presence when={store.state.show}><Presence when={true}><EmbedChild /></Presence></Presence>
