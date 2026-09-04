<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-ssr/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under `tests`.
	 * `tests/repo/skill-examples.test.ts` checks that each fence's markup is still
	 * a substring of this file.
	 *
	 * `MetaTags` is the shape the skill itself declares beside the first fence.
	 */
	import type { Store } from '../../src/lib/types.js';

	interface MetaTags {
		title: string;
		description: string;
		ogImage?: string;
		canonical?: string;
	}

	interface AppState {
		meta: MetaTags;
	}

	let { store }: { store: Store<AppState, { type: 'selectPost'; postId: string }> } = $props();
</script>

<!-- Meta tags & SEO — full set -->
<svelte:head>
  <title>{$store.meta.title}</title>
  <meta name="description" content={$store.meta.description} />
  {#if $store.meta.ogImage}
    <meta property="og:title" content={$store.meta.title} />
    <meta property="og:description" content={$store.meta.description} />
    <meta property="og:image" content={$store.meta.ogImage} />
  {/if}
  {#if $store.meta.canonical}
    <link rel="canonical" href={$store.meta.canonical} />
  {/if}
</svelte:head>

<!--
	Pitfall 3: forgetting to set meta tags — ✅ CORRECT.

	Svelte allows one `<svelte:head>` per component (svelte_meta_duplicate), so
	this second fence cannot be a live element in the same file as the first. It
	is pinned here textually for the substring check; both of its expressions are
	identical to ones the first `<svelte:head>` above typechecks.

<svelte:head>
  <title>{$store.meta.title}</title>
  <meta name="description" content={$store.meta.description} />
</svelte:head>
-->
