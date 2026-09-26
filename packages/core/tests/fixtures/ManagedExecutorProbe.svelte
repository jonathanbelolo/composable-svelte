<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createStore } from '../../src/lib/store.svelte.js';
  import { Effect } from '../../src/lib/effect.js';
  let { ready, cleaned }: { ready: Promise<void>; cleaned: () => void } = $props();
  export const store = createStore({ initialState: 0,
    reducer: (state: number, action: string) => [action === 'done' ? state + 1 : state,
      action === 'start' ? Effect.batch(Effect.run<string>(async dispatch => { await ready; dispatch('done'); }), Effect.subscription<string>('source', () => cleaned)) : Effect.none<string>()] as const,
    execution: { mode: 'managed' }
  });
  const value = $derived(store.state);
  // This fixture owns its plain store; automatic feature-store lifecycle is a later facade concern.
  onDestroy(() => store.destroy());
</script>
<output>{value}</output>
