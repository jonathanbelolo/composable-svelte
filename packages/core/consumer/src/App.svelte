<script lang="ts">
  import { ApplicationRoot, ApplicationHost } from '@composable-svelte/core/application';
  import { Button } from '@composable-svelte/core/components/ui';
  import { application } from './application';
  import type { State, Dependencies } from './counter';

  let {
    initialState = { count: 0, loading: false },
    dependencies = { load: async () => 42 }
  }: {
    initialState?: State;
    dependencies?: Dependencies;
  } = $props();
</script>

<ApplicationRoot
  definition={application}
  options={{
    dependencies,
    initial: { input: initialState }
  }}
>
  {#snippet children(app)}
    <ApplicationHost {app}>
      <main class="bg-background text-foreground p-6">
        <h1>Composable Svelte</h1>
        <p data-testid="count">{app.store.state.count}</p>
        <Button onclick={() => app.store.dispatch({ type: 'increment' })}>Increment</Button>
        <Button onclick={() => app.store.dispatch({ type: 'load' })} disabled={app.store.state.loading}>Load</Button>
        <Button onclick={() => document.documentElement.classList.toggle('dark')}>Theme</Button>
      </main>
    </ApplicationHost>
  {/snippet}
</ApplicationRoot>
