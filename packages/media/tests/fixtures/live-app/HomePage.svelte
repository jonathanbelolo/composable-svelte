<script lang="ts">
	import { useStagedRoute } from '@composable-svelte/core/application';
	import { useParticipant } from '@composable-svelte/core/application/motion';
	import VideoEmbed from '../../../src/lib/video-embed/VideoEmbed.svelte';
	import { definition, requesters, media, liveVideo, scoping } from './LiveModel.js';
	let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
	void store;
	requesters.push({ where: 'home', requester: useStagedRoute(definition) });
	const participant = useParticipant();
</script>
<main data-page="home">
	<div data-player="home" use:participant={{ key: 'player' }} style="width:320px">
		<VideoEmbed video={liveVideo} mediaKey="hero" mediaScope={scoping.explicit ? media : undefined} playerControl="player-api" />
	</div>
</main>
