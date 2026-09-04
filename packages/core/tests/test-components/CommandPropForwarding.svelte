<script lang="ts">
	import Command from '../../src/lib/components/command/Command.svelte';
	import type { CommandItem, CommandGroup } from '../../src/lib/components/command/command.types.js';
	import type { Snippet } from 'svelte';

	/**
	 * A consumer forwarding its own `$props()` straight through to `<Command>`.
	 *
	 * Nothing renders this — it exists to be *typechecked*. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * `<Command>` declares has to say `| undefined` or the palette cannot be
	 * wrapped at all. Five of them were fixed and two — `class` and `children` —
	 * were missed, which this would have caught.
	 */
	let {
		commands,
		groups,
		maxResults,
		caseSensitive,
		class: className,
		children
	}: {
		commands: CommandItem[];
		groups?: CommandGroup[];
		maxResults?: number;
		caseSensitive?: boolean;
		class?: string;
		children?: Snippet;
	} = $props();
</script>

<Command {commands} {groups} {maxResults} {caseSensitive} class={className} {children} />
