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
	import type { PresentationView } from '../../src/lib/navigation/managed-integration.js';

	interface Props {
		store: PresentationView<any, any> | undefined;
		/** Render a second dialog, to prove two on one page do not share ids. */
		twice?: boolean;
		/** Omit the title and name the dialog directly instead. */
		unlabelled?: boolean;
		onConfirm?: (() => void) | undefined;
		onCancel?: (() => void) | undefined;
	}

	let { store, twice = false, unlabelled = false, onConfirm, onCancel }: Props = $props();
</script>

{#if store?.state !== undefined}
	{#if unlabelled}
		<AlertDialog {store} ariaLabel="Named directly">
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
		<AlertDialog {store}>
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
			<AlertDialog {store}>
				{#snippet children()}
					<AlertDialogHeader>
						<AlertDialogTitle>Second dialog</AlertDialogTitle>
					</AlertDialogHeader>
				{/snippet}
			</AlertDialog>
		{/if}
	{/if}
{/if}
