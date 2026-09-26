<script lang="ts">
 import {untrack} from 'svelte';
 import PDFViewer from '../../src/lib/streaming-chat/attachment-components/PDFViewer.svelte';
 import AudioPlayer from '../../src/lib/streaming-chat/attachment-components/AudioPlayer.svelte';
 import VideoPlayer from '../../src/lib/streaming-chat/attachment-components/VideoPlayer.svelte';
 import ImagePreview from '../../src/lib/streaming-chat/attachment-components/ImagePreview.svelte';
 import type {MessageAttachment} from '../../src/lib/streaming-chat/types.js';
 let {initial,kind}:{initial:MessageAttachment;kind:'pdf'|'audio'|'video'|'image'}=$props();
 let attachment=$state(untrack(()=>initial));
 export function replace(next:MessageAttachment){attachment=next;}
</script>
{#if kind==='pdf'}<PDFViewer {attachment}/>{:else if kind==='audio'}<AudioPlayer {attachment}/>{:else if kind==='video'}<VideoPlayer {attachment}/>{:else}<ImagePreview {attachment}/>{/if}
