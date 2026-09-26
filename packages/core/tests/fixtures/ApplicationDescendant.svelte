<script lang="ts">
 import {untrack} from 'svelte';
 import type {ApplicationInstance} from '../../src/lib/application/index.js';
 import type {State,Action} from './ApplicationBasicModel.js';
 let {app}:{app:ApplicationInstance<State,Action>}=$props();
 untrack(()=>app.store.dispatch({type:'increment'}));
</script>
<span>descendant</span>
