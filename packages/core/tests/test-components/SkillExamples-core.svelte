<script module lang="ts">
	/**
	 * The recursive tree fence names a `FolderNode`. svelte2tsx hoists the types
	 * a `$props()` annotation references to module scope so the component's
	 * exported props type can see them, but skips a self-referential one — so
	 * `FolderNode` is declared at module scope here, where hoisting is moot.
	 */
	interface FileNode {
		type: 'file';
		id: string;
		name: string;
	}

	interface FolderNode {
		type: 'folder';
		id: string;
		name: string;
		isExpanded: boolean;
		children: readonly (FolderNode | FileNode)[];
	}
</script>

<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-core/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and
	 * it is typechecked because `svelte-check` reads every `.svelte` under `tests`.
	 * `tests/repo/skill-examples.test.ts` checks that each fence's markup is still
	 * a substring of this file.
	 *
	 * Every fence calls its store `store`, so one prop carries a state shape wide
	 * enough for all of them. `Todo`, `File` and `folder` stand in for things the
	 * skill's examples name but core does not ship.
	 */
	import type { Component } from 'svelte';
	import { elementAction } from '../../src/lib/composition/index.js';
	import type { ElementAction, IdentifiedItem } from '../../src/lib/composition/index.js';
	import type { Store } from '../../src/lib/types.js';

	interface Item {
		id: string;
		name: string;
	}

	interface TodoState {
		text: string;
		completed: boolean;
	}

	interface FixtureState {
		count: number;
		isLoading: boolean;
		error: string | null;
		items: readonly Item[];
		selectedId: string | null;
		todos: readonly IdentifiedItem<string, TodoState>[];
	}

	type FixtureAction =
		| { type: 'increment' }
		| { type: 'selectItem'; id: string }
		| { type: 'toggleExpand'; folderId: string }
		| ElementAction<'todo', string, { type: 'toggle' }>;

	let {
		store,
		state,
		folder,
		folderId,
		Todo,
		File
	}: {
		store: Store<FixtureState, FixtureAction>;
		state: { isLoading: boolean };
		folder: FolderNode;
		folderId: string;
		Todo: Component<{ todo: TodoState; onToggle: () => void }>;
		File: Component<{ store: Store<FixtureState, FixtureAction>; fileId: string }>;
	} = $props();

	const displayText = $derived(`Count: ${$store.count}`);
</script>

<!-- Rule 2, ✅ CORRECT — use $store directly -->
{#if $store.isLoading}
  <p>Loading...</p>
{:else}
  <p>{displayText}</p>
  <button onclick={() => store.dispatch({ type: 'increment' })}>
    Increment
  </button>
{/if}

<!-- Rule 2, ❌ WRONG — manual subscription -->
{#if state.isLoading}
  <p>Loading...</p>
{/if}

<!-- Core concept 1: Store — component usage -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
{#if $store.isLoading}
  <p>Loading...</p>
{:else if $store.error}
  <p class="error">{$store.error}</p>
{:else}
  <ul>
    {#each $store.items as item (item.id)}
      <li
        class:selected={$store.selectedId === item.id}
        onclick={() => store.dispatch({ type: 'selectItem', id: item.id })}
      >
        {item.name}
      </li>
    {/each}
  </ul>
{/if}

<!-- forEach — rendering elements -->
{#each $store.todos as todo (todo.id)}
  <Todo
    todo={todo.state}
    onToggle={() => store.dispatch(elementAction('todo', todo.id, { type: 'toggle' }))}
  />
{/each}

<!-- Recursive tree — Folder component -->
<!-- svelte-ignore svelte_self_deprecated -->
<div>
  <button onclick={() => store.dispatch({ type: 'toggleExpand', folderId })}>
    {folder.isExpanded ? '▼' : '▶'}
  </button>
  <span>{folder.name}</span>

  {#if folder.isExpanded}
    <div class="children">
      {#each folder.children as child (child.id)}
        {#if child.type === 'folder'}
          <svelte:self store={store} folderId={child.id} />
        {:else}
          <File store={store} fileId={child.id} />
        {/if}
      {/each}
    </div>
  {/if}
</div>

<!-- Common pattern: load on mount -->
{#if $store.isLoading}
  <p>Loading...</p>
{:else if $store.error}
  <p class="error">{$store.error}</p>
{:else}
  <ul>
    {#each $store.items as item (item.id)}
      <li>{item.name}</li>
    {/each}
  </ul>
{/if}
