<script lang="ts">
 import Scene from '../../src/components/Scene.svelte';
 import type { Store } from '@composable-svelte/core';
 import type { GraphicsState,GraphicsAction } from '../../src/core/types.js';
 let {store}:{store:Store<GraphicsState,GraphicsAction>}=$props();
 let width:string|number=$state(100),height:string|number=$state(200);
 export function resize(){width='75%';height=450;}
</script>
<Scene {store} {width} {height}/>
