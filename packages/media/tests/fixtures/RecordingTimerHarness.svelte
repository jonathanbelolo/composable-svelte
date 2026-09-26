<script lang="ts">
 import RecordingTimer from '../../src/lib/voice-input/components/RecordingTimer.svelte';
 let {onMax}: {onMax:()=>void}=$props();
 let start=$state(Date.now()); let maximum=$state(1);
 export function reset(at:number,max:number){start=at;maximum=max;}
</script>
<RecordingTimer startTime={start} maxDuration={maximum} onMaxDurationReached={onMax}/>
