<script lang="ts">
 import type { VideoEmbedData } from '../../src/lib/streaming-chat/types';
 let { video }: { video: VideoEmbedData } = $props();
</script>
<div data-optional-video={video.url}></div>
