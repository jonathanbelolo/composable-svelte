<script lang="ts">
 import { failures } from './RenderModel.js';
 let { kind }: { kind: 'conditional' | 'fallback' | 'shell' } = $props();
 if (failures[kind]) throw new Error(`${kind} mount failure`);
</script>
<span data-bomb={kind}>inert</span>
