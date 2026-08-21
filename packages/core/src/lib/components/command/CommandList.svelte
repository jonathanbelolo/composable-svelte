<!--
	CommandList Component

	Scrollable list container for filtered commands.
	Supports grouped and ungrouped display.

	@component
-->
<script lang="ts">
	import { getCommandContext } from './Command.svelte';
	import CommandItem from './CommandItem.svelte';
	import CommandGroup from './CommandGroup.svelte';
	import type { CommandItem as CommandItemData } from './command.types.js';
	import type { Snippet } from 'svelte';
	import type { Store } from '../../types.js';
	import type { CommandState, CommandAction } from './command.types.js';

	interface CommandListProps {
		/**
		 * Store managing command state.
		 */
		/**
		 * The palette store. Optional: inside `<Command>` it comes from
		 * context. Pass it explicitly only for standalone (non-modal) use
		 * with a store you own.
		 */
		store?: Store<CommandState, CommandAction>;

		/**
		 * Content to render (typically CommandItem or CommandGroup components).
		 */
		children?: Snippet;

		/**
		 * Empty state message.
		 */
		emptyMessage?: string;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let {
		store: storeProp,
		children,
		emptyMessage = 'No commands found.',
		class: className = ''
	}: CommandListProps = $props();

	// Falls back to the palette's context. This used to be a REQUIRED prop, so a
	// consumer had to build a second store — and everything `<Command>` was
	// configured with fed the internal one that nothing rendered.
	const store = $derived(storeProp ?? getCommandContext());

	const hasCommands = $derived($store.filteredCommands.length > 0);

	/**
	 * Commands grouped for rendering, in `filteredCommands` order.
	 *
	 * The order comes from the reducer, never from here — `nextCommand` and
	 * `executeCommand` index into `filteredCommands`, so re-ordering in the view
	 * would make the keyboard highlight and the executed command disagree.
	 * This only inserts a heading wherever the group id changes.
	 */
	const sections = $derived.by(() => {
		const out: Array<{ label: string | null; items: Array<{ command: CommandItemData; index: number }> }> = [];
		$store.filteredCommands.forEach((command, index) => {
			const groupId = command.group ?? null;
			const label = groupId
				? ($store.groups?.find((g) => g.id === groupId)?.label ?? groupId)
				: null;
			const last = out[out.length - 1];
			if (last && last.label === label) {
				last.items.push({ command, index });
			} else {
				out.push({ label, items: [{ command, index }] });
			}
		});
		return out;
	});
</script>

<div class="command-list {className}" role="listbox">
	{#if hasCommands}
		{#if children}
			{@render children()}
		{:else}
			<!--
				Renders from state when no snippet is supplied. Without this the
				component was a shell — it iterated nothing, so `commands`,
				`filterFunction`, `maxResults` and `groups` had nowhere to become
				visible and a consumer passing no children saw only the empty state.
			-->
			<!--
				Keyed by index, not label. Labels are not unique by construction —
				`applyFilter` now buckets every group so a run-length section
				cannot repeat one, but keying on data that only happens to be
				unique is how the duplicate-key crash happened in the first place.
			-->
			{#each sections as section, sectionIndex (sectionIndex)}
				{#if section.label}
					<CommandGroup label={section.label}>
						{#snippet children()}
							{#each section.items as entry (entry.command.id)}
								<CommandItem command={entry.command} index={entry.index} />
							{/each}
						{/snippet}
					</CommandGroup>
				{:else}
					{#each section.items as entry (entry.command.id)}
						<CommandItem command={entry.command} index={entry.index} />
					{/each}
				{/if}
			{/each}
		{/if}
	{:else}
		<!-- Empty State -->
		<div class="command-list-empty">
			<p>{emptyMessage}</p>
		</div>
	{/if}
</div>

<style>
	.command-list {
		overflow-y: auto;
		overflow-x: hidden;
		max-height: 24rem;
		padding: 0.5rem;
	}

	.command-list-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem 1rem;
		color: #9ca3af;
		font-size: 0.875rem;
		text-align: center;
	}

	.command-list-empty p {
		margin: 0;
	}

	/* Custom scrollbar styling */
	.command-list::-webkit-scrollbar {
		width: 8px;
	}

	.command-list::-webkit-scrollbar-track {
		background: transparent;
	}

	.command-list::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 4px;
	}

	.command-list::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}
</style>
