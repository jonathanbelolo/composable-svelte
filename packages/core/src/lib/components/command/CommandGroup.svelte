<!--
	CommandGroup Component

	Optional grouped commands display with a header label.

	@component
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface CommandGroupProps {
		/**
		 * Group label/heading.
		 */
		label: string;

		/**
		 * Command items in this group.
		 */
		children?: Snippet;

		/**
		 * Additional CSS classes.
		 */
		class?: string;
	}

	let { label, children, class: className = '' }: CommandGroupProps = $props();
</script>

<div class="command-group {className}" role="group" aria-labelledby="group-{label}">
	<!-- Group Header -->
	<div class="command-group-heading" id="group-{label}">
		{label}
	</div>

	<!-- Group Items -->
	<div class="command-group-items">
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.command-group {
		display: flex;
		flex-direction: column;
	}

	.command-group:not(:first-child) {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #f3f4f6;
	}

	.command-group-heading {
		padding: 0.25rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.command-group-items {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}
</style>
