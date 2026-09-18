<script lang="ts">
  import { VideoEmbed, detectVideo } from '@composable-svelte/media';

  // Pass a URL and let the component detect the platform…
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  // …or detect it yourself, when you need the metadata before rendering.
  const detected = detectVideo('https://vimeo.com/76979871');
</script>

<VideoEmbed {url} />

<VideoEmbed url="https://www.twitch.tv/videos/123456789" aspectRatio="4:3" />

<!-- Muted, because browsers block autoplay with sound. -->
<VideoEmbed {url} autoplay muted />

{#if detected}
  <p>{detected.platform} video {detected.videoId}</p>
  <VideoEmbed video={detected} showTitle />
{/if}
