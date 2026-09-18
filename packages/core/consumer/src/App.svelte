<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createStore } from '@composable-svelte/core';
  import { Button } from '@composable-svelte/core/components/ui';
  import { reducer } from './counter';
  const store = createStore({initialState:{count:0,loading:false},reducer,dependencies:{load:async()=>42}});
  onDestroy(()=>store.destroy());
</script>
<main class="bg-background text-foreground p-6">
  <h1>Composable Svelte</h1>
  <p data-testid="count">{store.state.count}</p>
  <Button onclick={()=>store.dispatch({type:'increment'})}>Increment</Button>
  <Button onclick={()=>store.dispatch({type:'load'})} disabled={store.state.loading}>Load</Button>
  <Button onclick={()=>document.documentElement.classList.toggle('dark')}>Theme</Button>
</main>
