<script lang="ts">
  import App from '../../src/App.svelte';
  import LifetimeHarness from './LifetimeHarness.svelte';
  import '../../src/app.css';

  // This ordinary injected service is fulfilled by the browser test's route.
  async function load(): Promise<number> {
    const response = await fetch('/__lifetime/load');
    if (!response.ok) throw new Error('Fixture load failed');
    return Number(await response.text());
  }
</script>

<LifetimeHarness>
  <App initialState={{ count: 7, loading: false }} dependencies={{ load }} />
</LifetimeHarness>
