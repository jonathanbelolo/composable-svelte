<script lang="ts">
	import { useParticipant } from '@composable-svelte/core/application/motion';
	import VideoEmbed from '../../../src/lib/video-embed/VideoEmbed.svelte';
	import { panelVideo } from './PresenceModel.js';
	const participant = useParticipant();
</script>
<div data-card use:participant={{ key: 'player' }} style="width:320px">
	<VideoEmbed video={panelVideo} playerControl="player-api" />
</div>
