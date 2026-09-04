<script lang="ts">
	/**
	 * The component example from
	 * `.claude/skills/composable-svelte-deployment/SKILL.md`, verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half; it is
	 * typechecked because `svelte-check` reads every `.svelte` under `tests`, and
	 * `tests/repo/skill-examples.test.ts` checks it is still a copy.
	 *
	 * The fence's own script does `import('./HeavyChart.svelte')` — a placeholder
	 * for the consumer's heavy component, which does not exist here — so the
	 * promise the markup awaits is a prop instead, typed as the module shape the
	 * `{:then}` destructures.
	 */
	import type { Component } from 'svelte';
	import { Spinner } from '../../src/lib/components/ui/index.js';

	let {
		showChart,
		heavyChart,
		chartData
	}: {
		showChart: boolean;
		heavyChart: Promise<{ default: Component<{ data: readonly number[] }> }>;
		chartData: readonly number[];
	} = $props();
</script>

<!-- Bundle Optimization: code splitting with a dynamic import and {#await} -->
{#if showChart}
  {#await heavyChart}
    <Spinner />
  {:then { default: HeavyChart }}
    <HeavyChart data={chartData} />
  {/await}
{/if}
