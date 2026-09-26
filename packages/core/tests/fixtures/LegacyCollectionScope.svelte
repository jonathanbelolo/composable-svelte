<script lang="ts">
 import type { Store } from '../../src/lib/types.js';
 let { store }: { store: Store<{ count: number }, { type: 'increment' }> } = $props();
 const count = $derived(store.state.count);
</script>
<output data-legacy-count>{count}</output>
