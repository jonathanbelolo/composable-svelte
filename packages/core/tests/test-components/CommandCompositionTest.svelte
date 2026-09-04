<script lang="ts">
	import Command from '../../src/lib/components/command/Command.svelte';
	import CommandInput from '../../src/lib/components/command/CommandInput.svelte';
	import CommandList from '../../src/lib/components/command/CommandList.svelte';
	import type { CommandItem, CommandGroup } from '../../src/lib/components/command/command.types.js';

	/**
	 * The composed form, written the way a consumer would.
	 *
	 * `CommandInput` and `CommandList` take **no `store` prop** — that is the
	 * whole point. They used to require one, so a consumer had to build a second
	 * store, and everything `<Command>` was configured with fed the internal one
	 * that nothing rendered.
	 *
	 * A `.ts` test file cannot express a snippet, which is why this exists.
	 */
	let {
		commands,
		groups,
		maxResults,
		caseSensitive,
		filterFunction
	}: {
		commands: CommandItem[];
		groups?: CommandGroup[];
		maxResults?: number;
		caseSensitive?: boolean;
		filterFunction?: (commands: CommandItem[], query: string) => CommandItem[];
	} = $props();
</script>

<Command
	open={true}
	{commands}
	{groups}
	{maxResults}
	{caseSensitive}
	{filterFunction}
>
	{#snippet children()}
		<CommandInput />
		<CommandList />
	{/snippet}
</Command>
