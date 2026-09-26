<script lang="ts">
 import {ApplicationRoot,ApplicationHost} from '../../src/lib/application/index.js';
 import {definition,type Dependencies} from './ApplicationBasicModel.js';
 let {dependencies}:{dependencies:Dependencies}=$props();
</script>
<ApplicationRoot {definition} options={{dependencies,initial:{input:0}}}>
 {#snippet children(app)}<ApplicationHost {app}><tr><td>{app.store.state.count}</td></tr></ApplicationHost>{/snippet}
</ApplicationRoot>
