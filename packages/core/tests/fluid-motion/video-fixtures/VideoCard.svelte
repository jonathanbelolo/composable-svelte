<script lang="ts">
 import { useParticipant } from '../../../src/lib/application/motion-public.js';
 import { hooks } from './VideoModel.js';
 const participant = useParticipant();
 let video: HTMLVideoElement;
 $effect(() => { hooks.video = video; });
</script>
<!-- The component's own media handlers: they must not run after the component retires. -->
<div data-card use:participant={{ key: 'card' }} style="width:200px;padding:6px;background:#0f172a">
 <video bind:this={video} loop playsinline onplay={() => hooks.handler.play++} onpause={() => hooks.handler.pause++} style="display:block;width:160px;height:90px"></video>
</div>
