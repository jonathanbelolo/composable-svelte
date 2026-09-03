<script lang="ts">
	/**
	 * The page an email-change link opens.
	 *
	 * Formless and mount-driven, like `EmailVerification`: the input arrived in
	 * a link, so the work starts on mount and there is nothing to type.
	 *
	 * **A live session is required, and that has a visible cost.** Accepting the
	 * token alone would let a forwarded mail, a shared inbox or a mail scanner
	 * complete an identity change silently — and unlike verifying an address,
	 * which is what its link was for anyway, this *moves* the account. The price
	 * is that a link opened on a device that is not signed in gets a 401, which
	 * is why `onSignIn` is required rather than optional: the cliff must be a
	 * route onward, never a dead end.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import type {
		ChangeEmailConfirmAction,
		ChangeEmailConfirmState
	} from '../flows/change-email-confirm/types.js';

	interface Props {
		flowStore: {
			readonly state: ChangeEmailConfirmState;
			dispatch(action: ChangeEmailConfirmAction): void;
		};
		/**
		 * The token from the link, or `null` when there is none.
		 *
		 * A prop rather than something this reads from `location`, so the same
		 * component works under SSR and in a test. `tokenFromUrl` is exported for
		 * the common case.
		 */
		token?: string | null | undefined;
		/**
		 * Where to send someone who is not signed in.
		 *
		 * **Required.** Confirming needs a live session, so this branch is
		 * reachable by anyone who opens the link on their phone — and a
		 * confirmation page that 401s with no way forward is the dead end this
		 * package has fixed three times elsewhere.
		 */
		onSignIn: () => void;
		/** Called once, when the address has changed. */
		onConfirmed?: ((email: string) => void) | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Replaces the default success message. Receives the new address. */
		confirmed?: Snippet<[{ email: string }]> | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		token = null,
		onSignIn,
		onConfirmed,
		headingLevel = 2,
		confirmed,
		class: className = ''
	}: Props = $props();

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const email = $derived(flowStore.state.email);

	/**
	 * The token already handed to the flow.
	 *
	 * Not `$state`: nothing renders from it. The status read below is what makes
	 * it safe — nothing is recorded as handed over until the flow is actually in
	 * a state to take it, so a token arriving mid-flight is picked up when the
	 * flow returns to `idle` rather than dropped.
	 */
	let requested: string | null = null;

	$effect(() => {
		if (token === null || token === requested) return;
		if (flowStore.state.status !== 'idle') return;
		requested = token;
		flowStore.dispatch({ type: 'confirmationRequested', token });
	});

	/** Whether the new address has been reported. Once per confirmation. */
	let reported = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'confirmed' || state.email === null) {
			reported = false;
			return;
		}
		if (reported) return;
		reported = true;
		onConfirmed?.(state.email);
	});

	/** Not signed in — the one failure with a route out rather than a retry. */
	const needsSignIn = $derived(error !== null && error.code === 'invalid_credentials');
	/** A spent or superseded link. A retry cannot help; a fresh request can. */
	const linkIsDead = $derived(error !== null && error.code === 'token_expired');
</script>

<div class="email-change-confirm {className}">
	<svelte:element this={`h${headingLevel}`} class="email-change-confirm__title">
		Confirming your new address
	</svelte:element>

	{#if status === 'confirmed' && email !== null}
		{#if confirmed}
			{@render confirmed({ email })}
		{:else}
			<p class="email-change-confirm__body" role="status" aria-live="polite">
				Done — your account now uses <strong>{email}</strong>.
			</p>
		{/if}
	{:else if status === 'confirming'}
		<p class="email-change-confirm__body" role="status" aria-live="polite">Confirming…</p>
	{:else if needsSignIn}
		<p class="email-change-confirm__body">
			Sign in first, then follow the link again — an address only moves on the account that asked
			for it.
		</p>
		<button type="button" class="email-change-confirm__primary" onclick={() => onSignIn()}>
			Sign in
		</button>
	{:else if linkIsDead}
		<p class="email-change-confirm__error" role="alert">
			That link is no longer valid. Ask for a new one from your settings — links expire, and
			asking again replaces the previous one.
		</p>
	{:else if error !== null}
		<p class="email-change-confirm__error" role="alert">{error.message}</p>
	{:else if token === null}
		<!--
			Last, not first. A failure can only exist if a request was made, so
			checking for a missing token ahead of the error branches made a 401
			unreachable — and a 401 here is precisely the case that needs a route
			onward rather than silence.
		-->
		<p class="email-change-confirm__body">
			This page needs the link from the email we sent you.
		</p>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.email-change-confirm {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: flex-start;
		width: 100%;
		max-width: 28rem;
	}

	.email-change-confirm__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.email-change-confirm__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.email-change-confirm__error {
		margin: 0;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.email-change-confirm__primary {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--primary-foreground, 210 40% 98%));
		background: hsl(var(--primary, 222.2 47.4% 11.2%));
		border: 1px solid transparent;
		border-radius: 0.375rem;
		cursor: pointer;
	}
</style>
