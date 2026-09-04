<script lang="ts">
	/**
	 * The component example from `.claude/skills/composable-svelte/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half; it is
	 * typechecked because `svelte-check` reads every `.svelte` under `tests`, and
	 * `tests/repo/skill-examples.test.ts` checks it is still a copy.
	 *
	 * The fence has no `<script>` block, so its `const count = $derived(...)` line
	 * is markup to the guard and to the compiler alike — it renders as text. It is
	 * kept as written because the guard compares what the fence says, not what it
	 * means.
	 */
	import type { Store } from '../../src/lib/types.js';

	let { store }: { store: Store<{ readonly count: number }, never> } = $props();
</script>

<!-- Store Reactivity: both access patterns -->
<!-- Rune-based (recommended) -->
const count = $derived(store.state.count);

<!-- Subscription-based (also works) -->
{$store.count}
