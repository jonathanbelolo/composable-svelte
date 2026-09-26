<script lang="ts">
  let { store }: { store: { readonly state: { count: number } | { text: string } | undefined } } = $props();
  const state = $derived(store.state);
  const kind = $derived(state && 'count' in state ? 'counter' : 'editor');
  const value = $derived(state && ('count' in state ? state.count : state.text));
</script>

<output data-destination-case={kind}>{value}</output>
