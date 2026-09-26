<script lang="ts">
 import Chart from '../../src/lib/components/Chart.svelte';
 import type {Store} from '@composable-svelte/core';
 import type {ChartState,ChartAction} from '../../src/lib/types/chart.types.js';
 let {store}:{store:Store<ChartState<unknown>,ChartAction<unknown>>}=$props();
 let width:number|undefined=$state(undefined),height:number|undefined=$state(undefined);
 let callback: ((selected: unknown[]) => void) | undefined = $state(undefined);
 export function selectionCallback(next: (selected: unknown[]) => void) { callback = next; }
 export function size(w?:number,h?:number){width=w;height=h;}
</script>
<Chart {store} {width} {height} onSelectionChange={callback}/>
