<script lang="ts">
 import { Presence, useLayoutChoreography, useParticipant, useRepresentationProvider } from '../../../src/lib/application/motion-public.js';
 import type { ApplicationStore } from '../../../src/lib/application/index.js';
 import { hooks, type PresenceState, type PresenceAction } from './PresenceModel.js';
 import EmbedChild from './EmbedChild.svelte';
 let { store }: { store: ApplicationStore<PresenceState, PresenceAction> } = $props();
 const layout = useLayoutChoreography();
 const participant = useParticipant();
 hooks.lookup = useRepresentationProvider('probe');
 hooks.transition = (plan, action) => layout.transition(plan, () => store.dispatch(action));
</script>
<Presence when={store.state.show}><EmbedChild /></Presence>
<div data-kept use:participant={{ key: 'kept' }} style="display:block;width:80px;height:30px;background:#334155">kept</div>
