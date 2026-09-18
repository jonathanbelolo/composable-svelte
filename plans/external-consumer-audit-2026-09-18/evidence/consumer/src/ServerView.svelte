<script lang="ts">
import type {Store} from '@composable-svelte/core';
let {store}:{store:Store<{count:number},{type:'increment'}>}=$props();
</script>
<h1>SSR count {store.state.count}</h1>
