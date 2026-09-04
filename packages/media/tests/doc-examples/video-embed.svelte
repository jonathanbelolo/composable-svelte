<!--
	Mirrors: packages/media/README.md

	The VideoEmbed quickstart, and the first code a consumer of this part of the
	package pastes.

	It is a file rather than a fenced block because a ```svelte fence is invisible
	to the TypeScript arm of the doc guard, and the Svelte arm checks syntax only,
	in two documents that do not include this one. That is exactly how this
	quickstart came to document three props the component did not have — `url`,
	`aspectRatio` and `muted` — while omitting the one it required. With no
	rest-spread, `<VideoEmbed url="…" />` dropped its only argument and rendered
	an error.

	As a file it is typechecked by `svelte-check` under `pnpm -r check`, so a prop
	that does not exist is a build failure, and the arm in `doc-examples.test.ts`
	asserts the README still quotes it verbatim.
-->
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
