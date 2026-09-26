<script lang="ts">
 import {scopeTo,type ApplicationStore,type ChildView} from '../../src/lib/application/index.js';
 import {nestedEditor,type Root,type Action,type Leaf,type LeafAction} from './ApplicationNestedModel.js';
 let {store,onView,onInitialView,incrementOnSetup=false}:{store:ApplicationStore<Root,Action>;onInitialView?:((view:ChildView<Leaf,LeafAction>|undefined)=>void)|undefined;onView?:((view:ChildView<Leaf,LeafAction>|undefined)=>void)|undefined;incrementOnSetup?:boolean|undefined}=$props();
 onInitialView?.(scopeTo(store,nestedEditor));
 const editor=$derived(scopeTo(store,nestedEditor));
 if(incrementOnSetup)scopeTo(store,nestedEditor)?.dispatch({type:'increment'});
 $effect(()=>{onView?.(editor);});
</script>
{#if editor?.state}<button onclick={()=>editor?.dispatch({type:'increment'})}>{editor.state.count}</button>{:else}<p>absent</p>{/if}
