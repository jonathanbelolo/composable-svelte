<script lang="ts">
  import { store } from './counter-store';
</script>

<div>
  <h1>Count: {store.state.count}</h1>
  <button onclick={() => store.dispatch({ type: 'increment' })}>
    +
  </button>
  <button onclick={() => store.dispatch({ type: 'decrement' })}>
    -
  </button>
  <button
    onclick={() => store.dispatch({ type: 'incrementAsync' })}
    disabled={store.state.isLoading}
  >
    Async +
  </button>
</div>
