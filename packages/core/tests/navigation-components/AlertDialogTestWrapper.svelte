<script lang="ts">
	import {
		AlertDialog,
		AlertDialogHeader,
		AlertDialogTitle,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogAction,
		AlertDialogCancel
	} from '../../src/lib/navigation-components/alert-dialog/index.js';
	import { scopeToDestination } from '../../src/lib/navigation/scope-to-destination.js';
	import type { Store } from '../../src/lib/types.js';

	interface Props {
		parentStore: Store<any, any>;
		/** Render a second dialog, to prove two on one page do not share ids. */
		twice?: boolean;
		/** Omit the title and name the dialog directly instead. */
		unlabelled?: boolean;
		onConfirm?: (() => void) | undefined;
		onCancel?: (() => void) | undefined;
	}

	let { parentStore, twice = false, unlabelled = false, onConfirm, onCancel }: Props = $props();

	const scopedStore = $derived(
		parentStore.state.destination
			? scopeToDestination(parentStore, ['destination'], 'test', 'destination')
			: null
	);
</script>

{#if scopedStore}
	{#if unlabelled}
		<AlertDialog store={scopedStore} labelled={false} described={false} ariaLabel="Named directly">
			{#snippet children()}
				<AlertDialogFooter>
					<AlertDialogCancel onclick={() => onCancel?.()}>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onclick={() => onConfirm?.()}>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			{/snippet}
		</AlertDialog>
	{:else}
		<AlertDialog store={scopedStore}>
			{#snippet children()}
				<AlertDialogHeader>
					<AlertDialogTitle>Delete this project?</AlertDialogTitle>
					<AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onclick={() => onCancel?.()}>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onclick={() => onConfirm?.()}>
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			{/snippet}
		</AlertDialog>
		{#if twice}
			<AlertDialog store={scopedStore}>
				{#snippet children()}
					<AlertDialogHeader>
						<AlertDialogTitle>Second dialog</AlertDialogTitle>
					</AlertDialogHeader>
				{/snippet}
			</AlertDialog>
		{/if}
	{/if}
{/if}
