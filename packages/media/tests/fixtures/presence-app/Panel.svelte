<script lang="ts">
	import { Presence, useLayoutChoreography } from '@composable-svelte/core/application/motion';
	import type { ApplicationStore } from '@composable-svelte/core/application';
	import { hooks, type PanelState, type PanelAction } from './PresenceModel.js';
	import PlayerCard from './PlayerCard.svelte';
	let { store }: { store: ApplicationStore<PanelState, PanelAction> } = $props();
	const layout = useLayoutChoreography();
	hooks.transition = (plan, action) => layout.transition(plan, () => store.dispatch(action));
</script>
<Presence when={store.state.show}><PlayerCard /></Presence>
<p data-kept>kept</p>
