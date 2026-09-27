<script lang="ts">
 import { onMount } from 'svelte';
 import { FeatureOutlet, type PresentationFeatureViewProps, type SlotSchema } from '../../../src/lib/application/index.js';
 import Bomb from './Bomb.svelte';
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 import { viewEvents, type Page, type PageAction, type Panel, type PanelAction } from './RenderModel.js';
 let { store, views }: PresentationFeatureViewProps<Page, PageAction, Record<'panel', SlotSchema<Panel, PanelAction, {}, true>>> = $props();
 onMount(() => { viewEvents.push(`page:mount:${store.state?.url}`); return () => viewEvents.push(`page:unmount:${store.state?.url ?? 'retired'}`); });
 // Later reactive failure: a template-read derived value throws on one state.
 const doubled = $derived.by(() => { if (store.state?.count === 13) throw new Error('reactive failure 13'); return (store.state?.count ?? 0) * 2; });
 const participant = useParticipant();
  // Later effect failure: an effect body throws on one state.
 $effect(() => { if (store.state?.count === 21) throw new Error('effect failure 21'); });
</script>
<main data-page={store.state?.url}>
 <div data-hero use:participant={{ key: 'hero' }} style="display:block;width:120px;height:40px">Hero</div>
 <p data-doubled>{doubled}</p>
 {#if store.state?.explode}<Bomb kind="conditional"/>{/if}
 <FeatureOutlet view={views.panel}/>
</main>
