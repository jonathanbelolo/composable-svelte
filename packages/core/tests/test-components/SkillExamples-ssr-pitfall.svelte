<script lang="ts">
	/**
	 * The second `<svelte:head>` example from
	 * `.claude/skills/composable-svelte-ssr/SKILL.md` (Pitfall 3, "forgetting to
	 * set meta tags — CORRECT"), verbatim. Svelte allows one `<svelte:head>` per
	 * component (svelte_meta_duplicate), so it cannot share
	 * `SkillExamples-ssr.svelte` with the first; `tests/repo/skill-examples.test.ts`
	 * reads both fixtures for that skill.
	 */
	import type { Store } from '../../src/lib/types.js';

	interface MetaTags {
		title: string;
		description: string;
	}

	interface AppState {
		meta: MetaTags;
	}

	let { store }: { store: Store<AppState, { type: 'selectPost'; postId: string }> } = $props();
</script>

<svelte:head>
  <title>{$store.meta.title}</title>
  <meta name="description" content={$store.meta.description} />
</svelte:head>
