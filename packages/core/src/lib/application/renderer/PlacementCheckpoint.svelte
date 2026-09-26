<script lang="ts">
 import type {PlacementScope} from './placement.svelte.js';
 let {scope}:{scope:PlacementScope}=$props();
 scope.verify();
</script>
