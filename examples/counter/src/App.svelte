<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { counterReducer, initialState, type CounterAction } from './counter';
  import { onDestroy } from 'svelte';

  // Create store (uses Svelte 5 $state internally)
  const store = createStore({
    initialState,
    reducer: counterReducer
  });

  // Derived state (uses Svelte 5 $derived for reactivity)
  const canDecrement = $derived(store.state.count > 0);
  const displayFact = $derived(
    store.state.isLoading
      ? 'Loading...'
      : store.state.error
        ? `Error: ${store.state.error}`
        : store.state.fact ?? 'Click "Get Fact" to load a fun fact about this number!'
  );

  // Clean up on unmount
  onDestroy(() => store.destroy());
</script>

<main>
  <div class="container">
    <h1>Counter Example</h1>
    <p class="subtitle">Demonstrating Composable Svelte core concepts</p>

    <div class="counter-display">
      <h2>Count: {store.state.count}</h2>
    </div>

    <div class="button-group">
      <button
        class="button"
        onclick={() => store.dispatch({ type: 'decrementTapped' })}
        disabled={!canDecrement}
      >
        −
      </button>

      <button
        class="button primary"
        onclick={() => store.dispatch({ type: 'incrementTapped' })}
      >
        +
      </button>

      <button
        class="button secondary"
        onclick={() => store.dispatch({ type: 'resetTapped' })}
      >
        Reset
      </button>
    </div>

    <div class="fact-section">
      <button
        class="button info"
        onclick={() => store.dispatch({ type: 'loadFactTapped' })}
        disabled={store.state.isLoading}
      >
        {store.state.isLoading ? 'Loading...' : 'Get Fact'}
      </button>

      <div class="fact-display" class:error={store.state.error !== null}>
        {displayFact}
      </div>
    </div>

    <div class="info-panel">
      <h3>This example demonstrates:</h3>
      <ul>
        <li><strong>State Management:</strong> Reactive state using Svelte 5 $state</li>
        <li><strong>Actions:</strong> Discriminated union of all events</li>
        <li><strong>Pure Reducers:</strong> State transformations without side effects</li>
        <li><strong>Effects:</strong> Async API calls with Effect.run()</li>
        <li><strong>Derived State:</strong> Computed values with $derived</li>
        <li><strong>Type Safety:</strong> Full TypeScript integration</li>
      </ul>
    </div>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
      Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }

  main {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .container {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    max-width: 600px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  h1 {
    margin: 0 0 0.5rem 0;
    color: #333;
    text-align: center;
  }

  .subtitle {
    margin: 0 0 2rem 0;
    color: #666;
    text-align: center;
    font-size: 0.9rem;
  }

  .counter-display {
    text-align: center;
    margin: 2rem 0;
  }

  .counter-display h2 {
    font-size: 3rem;
    margin: 0;
    color: #667eea;
  }

  .button-group {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .button {
    padding: 0.75rem 1.5rem;
    font-size: 1.25rem;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    background: #e0e0e0;
    color: #333;
  }

  .button:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .button:active:not(:disabled) {
    transform: translateY(0);
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .button.primary {
    background: #667eea;
    color: white;
  }

  .button.secondary {
    background: #f56565;
    color: white;
  }

  .button.info {
    background: #48bb78;
    color: white;
    width: 100%;
    margin-bottom: 1rem;
  }

  .fact-section {
    margin: 2rem 0;
  }

  .fact-display {
    background: #f7fafc;
    padding: 1rem;
    border-radius: 0.5rem;
    min-height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #2d3748;
    line-height: 1.5;
  }

  .fact-display.error {
    background: #fff5f5;
    color: #c53030;
  }

  .info-panel {
    background: #edf2f7;
    padding: 1.5rem;
    border-radius: 0.5rem;
    margin-top: 2rem;
  }

  .info-panel h3 {
    margin: 0 0 1rem 0;
    color: #2d3748;
  }

  .info-panel ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .info-panel li {
    margin-bottom: 0.5rem;
    color: #4a5568;
    line-height: 1.6;
  }

  .info-panel strong {
    color: #667eea;
  }
</style>
