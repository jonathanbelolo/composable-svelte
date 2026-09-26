<script lang="ts">
 import type {ChildView} from '../../src/lib/application/index.js';
 import type {Leaf,LeafAction} from './ApplicationNestedModel.js';
 let {view}:{view:ChildView<Leaf,LeafAction>}=$props();
</script>
<p>{view.state?.count??'retired'}</p>
