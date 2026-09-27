<script lang="ts">
 import { useLayoutChoreography, useParticipant } from '../../../src/lib/application/motion-public.js';
 import type { ApplicationStore } from '../../../src/lib/application/index.js';
 import { panelToggles, type LocalState, type LocalAction } from './LocalModel.js';
 let { store }: { store: ApplicationStore<LocalState, LocalAction> } = $props();
 const layout = useLayoutChoreography();
 const participant = useParticipant();
 // The business commit is an explicit, immediate dispatch; the transition only bridges the layouts.
 panelToggles.push({ toggle: plan => layout.transition(plan, () => store.dispatch({ type: 'toggle' })) });
</script>
<div data-panel-local use:participant={{ key: 'panel' }} style={`display:block;width:${store.state.open ? 360 : 120}px;height:${store.state.open ? 200 : 50}px;background:rgb(10,90,160)`}>Panel</div>
