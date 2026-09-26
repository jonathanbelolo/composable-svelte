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
	import type { PresentationView } from '@composable-svelte/core/application';

	import type {
		ChangeEmailConfirmAction,
		ChangeEmailConfirmState
	} from '../flows/change-email-confirm/types.js';

	interface StandaloneBinding {
		mode?: 'standalone' | undefined;
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
		 * **Required in standalone mode.** Confirming needs a live session, so this branch is
		 * reachable by anyone who opens the link on their phone — and a
		 * confirmation page that 401s with no way forward is the dead end this
		 * package has fixed three times elsewhere.
		 */
		onSignIn: () => void;
		/** Called once, when the address has changed. */
		onConfirmed?: ((email: string) => void) | undefined;
	}

	interface ManagedBinding {
		mode: 'managed';
		flowStore: PresentationView<ChangeEmailConfirmState, ChangeEmailConfirmAction>;
		token?: string | null | undefined;
		onSignIn?: never;
		onConfirmed?: never;
	}

	interface PresentationProps {
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Replaces the default success message. Receives the new address. */
		confirmed?: Snippet<[{ email: string }]> | undefined;
		class?: string | undefined;
	}

	type Props = PresentationProps & (StandaloneBinding | ManagedBinding);

	let {
		headingLevel = 2,
		confirmed,
		class: className = '',
		...binding
	}: Props = $props();

	type Owner = symbol | PresentationView<ChangeEmailConfirmState, ChangeEmailConfirmAction>;
	const standaloneOwner = Symbol('standalone');
	const owner: Owner = $derived(binding.mode === 'managed' ? binding.flowStore : standaloneOwner);
	const viewOf = (key: Owner) => (typeof key === 'symbol' ? binding.flowStore : key);

	const flow: ChangeEmailConfirmState | undefined = $derived(binding.flowStore.state);
	const status = $derived(flow?.status);
	const error = $derived(flow?.error ?? null);
	const email = $derived(flow?.email ?? null);
	const token = $derived(
		binding.mode === 'managed'
			? (binding.token !== undefined ? binding.token : (flow?.token ?? null))
			: (binding.token ?? null)
	);

	/**
	 * The token already handed to the flow.
	 *
	 * Not `$state`: nothing renders from it. The status read below is what makes
	 * it safe — nothing is recorded as handed over until the flow is actually in
	 * a state to take it, so a token arriving mid-flight is picked up when the
	 * flow returns to `idle` rather than dropped.
	 */
	let requestedOwner: Owner | null = null;
	let requestedToken: string | null = null;
	let cancelledToken: string | null = null;

	$effect(() => {
		const key = owner;
		const view = viewOf(key);
		if (key !== requestedOwner) {
			requestedOwner = key;
			const isCurrentToken = view.state?.token === token;
			const hasAttempted =
				isCurrentToken &&
				(view.state?.status === 'confirming' ||
					view.state?.status === 'confirmed' ||
					(view.state?.status === 'idle' && view.state?.error !== null));
			requestedToken = hasAttempted ? token : null;
			cancelledToken = null;
		}
		if (view.state === undefined) return;
		if (token === null) return;
		if (token !== requestedToken && view.state.status === 'confirming' && token !== cancelledToken) {
			cancelledToken = token;
			view.dispatch({ type: 'tokenProvided', token });
		}
		if (token === requestedToken) return;
		if (view.state.status !== 'idle') return;
		requestedToken = token;
		cancelledToken = null;
		view.dispatch({ type: 'confirmationRequested', token });
	});

	/** Whether the new address has been reported. Once per confirmation. */
	let reported = false;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const state = binding.flowStore.state;
		if (state.status !== 'confirmed' || state.email === null) {
			reported = false;
			return;
		}
		if (reported) return;
		reported = true;
		binding.onConfirmed?.(state.email);
	});

	function signIn(key: Owner) {
		if (binding.mode !== 'managed' && binding.onSignIn !== undefined) {
			binding.onSignIn();
		} else if (binding.mode === 'managed') {
			viewOf(key).dispatch({ type: 'signInRequested' });
		}
	}

	/** Not signed in — the one failure with a route out rather than a retry. */
	const needsSignIn = $derived(error !== null && error.code === 'invalid_credentials');
	/** A spent or superseded link. A retry cannot help; a fresh request can. */
	const linkIsDead = $derived(error !== null && error.code === 'token_expired');
</script>

{#if flow}
	{#each [owner] as key (key)}
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
				<button type="button" class="email-change-confirm__primary" onclick={() => signIn(key)}>
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
	{/each}
{/if}

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
