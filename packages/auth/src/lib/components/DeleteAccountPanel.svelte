<script lang="ts">
	/**
	 * Deleting the account.
	 *
	 * **The confirmation is a step in the flow, not a property of this markup.**
	 * `deletionRequested` is reachable only from `confirming`, so a consumer who
	 * renders their own dialog — or none — gets the same protection this panel
	 * does. What is rendered here is the *asking*, not the guarding.
	 *
	 * **This does not import core's `AlertDialog`, deliberately.** Auth
	 * components are scoped CSS over theme tokens and work with no Tailwind at
	 * all; `AlertDialog` is Tailwind by design, so embedding it would render a
	 * full-screen transparent overlay in any app that has not wired Tailwind to
	 * core — the exact defect the root CLAUDE.md opens with, in the worst
	 * possible place. The `confirm` snippet is the seam for consumers who *have*
	 * wired it and want a modal.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import { isReauthenticationRequired } from '../errors/helpers.js';
	import type { DeleteAccountAction, DeleteAccountState } from '../flows/delete-account/types.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		store: {
			readonly state: DeleteAccountState;
			dispatch(action: DeleteAccountAction): void;
		};
		/**
		 * **Required**, unlike every other panel's session store.
		 *
		 * This flow ends in the *absence* of a session, and the session store has
		 * to be told or the app goes on rendering a signed-in shell over an
		 * account that no longer exists. A required prop makes a forgotten wiring
		 * a compile error; an optional callback would fail silently.
		 */
		sessionStore: { dispatch(action: SessionAction): void };
		/** The address being deleted, from `fetchAccount`. Named in the copy. */
		email?: string | undefined;
		/** Called once, after the session store has been told. */
		onDeleted?: (() => void) | undefined;
		/**
		 * Called when the backend wants the user to confirm it is still them.
		 *
		 * The principal branch here: deleting an account is exactly the operation
		 * a backend should demand proof for.
		 */
		onReauthenticationRequired?:
			| ((demand: { methods: readonly ('password' | 'totp' | 'recovery_code')[] }) => void)
			| undefined;
		/**
		 * Render the confirmation yourself — a modal, a typed phrase, anything.
		 *
		 * Receives `confirm` and `cancel` so it never has to know the action
		 * names, and `busy` so it can disable while the request is out. With no
		 * snippet this panel renders an inline, non-modal confirmation.
		 */
		confirm?: Snippet<[{ confirm: () => void; cancel: () => void; busy: boolean }]> | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Rendered below on every branch. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		store,
		sessionStore,
		email,
		onDeleted,
		onReauthenticationRequired,
		confirm: confirmSnippet,
		headingLevel = 2,
		footer,
		class: className = ''
	}: Props = $props();

	const status = $derived(store.state.status);
	const error = $derived(store.state.error);
	const isDeleting = $derived(status === 'deleting');
	const isConfirming = $derived(status === 'confirming');

	const confirm = () => store.dispatch({ type: 'deletionRequested' });
	const cancel = () => store.dispatch({ type: 'confirmationDismissed' });

	/** Whether the ending has been handed over. Once per deletion. */
	let handedOver = false;

	$effect(() => {
		if (store.state.status !== 'deleted') {
			handedOver = false;
			return;
		}
		if (handedOver) return;
		handedOver = true;
		// The server has already destroyed the session and cleared the cookie.
		// The reducer fails closed to `anonymous` whether or not the call
		// succeeds, so this is telling the store what has already happened.
		sessionStore.dispatch({ type: 'logout' });
		onDeleted?.();
	});

	/**
	 * Whether the re-authentication demand has been reported.
	 *
	 * Cleared whenever the flow is not sitting on one, so it is once per demand.
	 */
	let reportedDemand = false;

	$effect(() => {
		const current = store.state.error;
		if (onReauthenticationRequired === undefined || !isReauthenticationRequired(current)) {
			reportedDemand = false;
			return;
		}
		if (reportedDemand) return;
		reportedDemand = true;
		onReauthenticationRequired({ methods: current.methods });
	});

	/** A demand a consumer is handling is not a failure to paint red. */
	const showsError = $derived(
		error !== null &&
			!(onReauthenticationRequired !== undefined && isReauthenticationRequired(error))
	);
</script>

<div class="delete-account {className}">
	<svelte:element this={`h${headingLevel}`} class="delete-account__title">
		Delete your account
	</svelte:element>

	{#if status === 'deleted'}
		<p class="delete-account__body" role="status" aria-live="polite">
			Your account has been deleted.
		</p>
	{:else}
		<p class="delete-account__body">
			This removes {email !== undefined ? email : 'your account'} and everything on it, permanently.
			It cannot be undone.
		</p>

		{#if showsError && error !== null}
			<p class="delete-account__error" role="alert">{error.message}</p>
		{/if}

		{#if isConfirming || isDeleting}
			{#if confirmSnippet}
				{@render confirmSnippet({ confirm, cancel, busy: isDeleting })}
			{:else}
				<div class="delete-account__confirm" role="group" aria-label="Confirm deletion">
					<p class="delete-account__body">
						Are you sure? There is no way back from this.
					</p>
					<div class="delete-account__actions">
						<button
							type="button"
							class="delete-account__secondary"
							disabled={isDeleting}
							onclick={cancel}
						>
							Keep my account
						</button>
						<button
							type="button"
							class="delete-account__destructive"
							disabled={isDeleting}
							onclick={confirm}
						>
							{isDeleting ? 'Deleting…' : 'Delete permanently'}
						</button>
					</div>
				</div>
			{/if}
		{:else}
			<button
				type="button"
				class="delete-account__destructive"
				onclick={() => store.dispatch({ type: 'confirmationRequested' })}
			>
				Delete my account
			</button>
		{/if}
	{/if}

	{#if footer}
		<div class="delete-account__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.delete-account {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: flex-start;
		width: 100%;
		max-width: 28rem;
	}

	.delete-account__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.delete-account__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.delete-account__confirm {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
		padding: 0.75rem;
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.05);
	}

	.delete-account__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.delete-account__error {
		margin: 0;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.delete-account__secondary,
	.delete-account__destructive {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.delete-account__secondary {
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
	}

	.delete-account__destructive {
		color: hsl(var(--primary-foreground, 210 40% 98%));
		background: hsl(var(--destructive, 0 84.2% 60.2%));
		border: 1px solid transparent;
	}

	.delete-account__secondary:disabled,
	.delete-account__destructive:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.delete-account__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
