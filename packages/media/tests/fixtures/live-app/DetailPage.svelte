<script lang="ts">
	import { useParticipant } from '@composable-svelte/core/application/motion';
	import VideoEmbed from '../../../src/lib/video-embed/VideoEmbed.svelte';
	import { media, liveVideo, scoping } from './LiveModel.js';
	let { store }: { store: unknown; views: unknown; surface: unknown } = $props();
	void store;
	const participant = useParticipant();
</script>
<section data-page="detail">
	<div data-player="detail" use:participant={{ key: 'player' }} style="width:480px;margin-left:200px">
		<VideoEmbed video={liveVideo} mediaKey="hero" mediaScope={scoping.explicit ? media : undefined} playerControl="player-api" />
	</div>
</section>
