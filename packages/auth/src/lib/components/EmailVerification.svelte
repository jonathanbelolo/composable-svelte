<script lang="ts">
	/**
	 * The page a confirmation link lands on.
	 *
	 * Unlike `LoginForm` and `SignupForm` this has no form and no submit: the
	 * work starts on mount, because the input arrived in the URL. The user's only
	 * choices are to ask for another mail or to go and sign in.
	 *
	 * **The token is a prop, not something this reads from `location`.** That
	 * keeps it renderable on a server, testable without a URL, and usable with
	 * whatever router the consumer has already parsed the query with.
	 * `tokenFromUrl` is there for the common case.
	 *
	 * Three states to render, and the middle one is the reason this component is
	 * worth having: no token at all (someone reached the page directly),
	 * confirming, confirmed, or failed-with-a-way-out.
	 */
	import type { Snippet } from 'svelte';
	import type { PresentationView } from '@composable-svelte/core/application';

	import type {
		EmailVerificationAction,
		EmailVerificationState
	} from '../flows/email-verification/types.js';
	import type { SessionAction } from '../session/types.js';

	interface StandaloneBinding {
		mode?: 'standalone' | undefined;
		flowStore: {
			readonly state: EmailVerificationState;
			dispatch(action: EmailVerificationAction): void;
		};
		/** Where a session is handed over, when confirming issued one. */
		sessionStore: { dispatch(action: SessionAction): void };
		/** Called once, after a session has been established. */
		onSuccess?: (() => void) | undefined;
		/** Offered once the address is confirmed but no session was issued. */
		onSignIn?: (() => void) | undefined;
	}

	interface ManagedBinding {
		mode: 'managed';
		flowStore: PresentationView<EmailVerificationState, EmailVerificationAction>;
		sessionStore?: never;
		onSuccess?: never;
		onSignIn?: never;
	}

	interface PresentationProps {
		/** Token from the confirmation link, or `null` when missing. No request starts during SSR. */
		token?: string | null | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Replaces the confirmed panel. Receives whether a session was issued. */
		verified?: Snippet<[{ signedIn: boolean }]> | undefined;
		class?: string | undefined;
	}

	type Props = PresentationProps & (StandaloneBinding | ManagedBinding);

	let {
		token = null,
		headingLevel = 2,
		verified,
		class: className = '',
		...binding
	}: Props = $props();

	const flow: EmailVerificationState | undefined = $derived(binding.flowStore.state);
	const status = $derived(flow?.status);
	const error = $derived(flow?.error ?? null);
	const session = $derived(flow?.session ?? null);
	const email = $derived(flow?.email ?? null);
	const resendStatus = $derived(flow?.resendStatus);
	const resendError = $derived(flow?.resendError ?? null);

	/**
	 * The token this component has already handed to the flow.
	 *
	 * A plain `let`, per the animation-guard convention. Both this and the
	 * reducer's own guard are load-bearing, and they cover **different states** —
	 * measured, not assumed:
	 *
	 * - The reducer refuses unless the status is `idle`, which stops a re-exchange
	 *   while one is running or after it succeeded.
	 * - `idle` is the one state it must leave open, so a *fresh* token can be
	 *   tried after a failure. That is exactly the state a failed verification
	 *   returns to — so without this guard, a dead link becomes a runaway: fail,
	 *   re-dispatch, fail. With it, one exchange; without it, the test cannot
	 *   even finish.
	 *
	 * The status read matters too. A token that arrives *while another is in
	 * flight* is refused by the reducer, and recording it here anyway would mean
	 * it was never tried at all — silently, and forever. Not recording it leaves
	 * the effect to pick it up when the flow returns to `idle`.
	 */
	let requested: string | null = null;

	/**
	 * Whose exchange `requested` records, and what keys the rendered subtree.
	 *
	 * Managed: the view itself — a fresh owner is a fresh flow, owed its own
	 * exchange and its own DOM, and each subtree dispatches to the view it was
	 * rendered for. Standalone: one owner for the component's life, whatever
	 * wrapper identity the consumer passes, so a wrapper rebuilt on every state
	 * change neither re-exchanges a failed token nor remounts the focused DOM,
	 * and dispatch reaches the current `flowStore`, as it always has.
	 */
	type Owner = symbol | PresentationView<EmailVerificationState, EmailVerificationAction>;
	const standaloneOwner = Symbol('standalone');
	const owner: Owner = $derived(binding.mode === 'managed' ? binding.flowStore : standaloneOwner);
	const viewOf = (key: Owner) => (typeof key === 'symbol' ? binding.flowStore : key);
	let requestedOwner: Owner | null = null;

	$effect(() => {
		const key = owner;
		if (key !== requestedOwner) { requestedOwner = key; requested = null; }
		const view = viewOf(key);
		if (view.state === undefined) return;
		if (token === null || token === requested) return;
		// Reading status is what makes the line above safe to rely on: nothing is
		// recorded as handed over until the flow is actually in a state to take it.
		if (view.state.status !== 'idle') return;
		requested = token;
		view.dispatch({ type: 'verificationRequested', token });
	});

	/** Whether the session produced by confirming has been handed over. */
	let handedOver = false;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const state = binding.flowStore.state;
		if (state.status !== 'verified') {
			handedOver = false;
			return;
		}
		if (handedOver || state.session === null) return;
		handedOver = true;
		binding.sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		binding.onSuccess?.();
	});

	function signIn(key: Owner) {
		if (binding.mode === 'managed') viewOf(key).dispatch({ type: 'signInRequested' });
		else binding.onSignIn?.();
	}
	const offersSignIn = $derived(binding.mode === 'managed' || binding.onSignIn !== undefined);

	/**
	 * The default confirmed panel, focused when it replaces what was there.
	 *
	 * The submit-shaped control the user last touched is gone, and without this
	 * focus falls to `<body>`. Some screen readers will then announce the panel
	 * twice — once as the live region, once on focus — which is the lesser of the
	 * two, exactly as in `SignupForm`.
	 *
	 * **A consumer supplying `verified` owns focus themselves.** This binding is
	 * inside the default branch, so it is null when the snippet replaces it and
	 * the call below is a no-op rather than a surprise.
	 */
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'verified') panel?.focus();
	});
</script>

{#if flow}
{#each [owner] as key (key)}
<div class="email-verification {className}">
	{#if status === 'verifying'}
		<p class="email-verification__working" role="status" aria-live="polite">Confirming your email…</p>
	{:else if status === 'verified'}
		{#if verified}
			{@render verified({ signedIn: session !== null })}
		{:else}
			<div
				bind:this={panel}
				class="email-verification__panel"
				role="status"
				aria-live="polite"
				tabindex="-1"
			>
				<svelte:element this={`h${headingLevel}`} class="email-verification__title">
					Email confirmed
				</svelte:element>
				<p class="email-verification__body">
					{#if session !== null}
						You are signed in and ready to go.
					{:else}
						Your address is confirmed. You can sign in now.
					{/if}
				</p>
				{#if session === null && offersSignIn}
					<button type="button" class="email-verification__action" onclick={() => signIn(key)}>
						Sign in
					</button>
				{/if}
			</div>
		{/if}
	{:else}
		<!--
			Idle: either no token arrived, or one did and failed. Both end in the
			same offer, which is why they share a branch rather than duplicating it.
		-->
		<svelte:element this={`h${headingLevel}`} class="email-verification__title">
			{token === null ? 'Confirm your email' : 'That link did not work'}
		</svelte:element>

		{#if error}
			<div
				class="email-verification__error"
				role="alert"
				aria-live="polite"
				data-error-code={error.code}
			>
				{error.message}
			</div>
		{:else if token === null}
			<p class="email-verification__body">
				Open the link in the email we sent you. If it has expired, ask for another.
			</p>
		{/if}

		{#if email !== null}
			<div class="email-verification__resend">
				{#if resendStatus === 'sent'}
					<p class="email-verification__body" role="status" aria-live="polite">
						Sent. Check <strong>{email}</strong> for a new link.
					</p>
				{:else}
					<p class="email-verification__body">
						We can send another link to <strong>{email}</strong>.
					</p>
				{/if}

				{#if resendError}
					<div
						class="email-verification__error"
						role="alert"
						aria-live="polite"
						data-error-code={resendError.code}
					>
						{resendError.message}
					</div>
				{/if}

				<button
					type="button"
					class="email-verification__action"
					disabled={resendStatus === 'sending'}
					onclick={() => viewOf(key).dispatch({ type: 'resendRequested' })}
				>
					{resendStatus === 'sending' ? 'Sending…' : 'Send another link'}
				</button>
			</div>
		{/if}
	{/if}
</div>
{/each}
{/if}

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.email-verification {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 24rem;
		padding: 2rem;
		color: hsl(var(--card-foreground, 222.2 84% 4.9%));
		background: hsl(var(--card, 0 0% 100%));
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
		border-radius: 0.5rem;
	}

	.email-verification__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.email-verification__panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.email-verification__panel:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
	}

	.email-verification__body,
	.email-verification__working {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.email-verification__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.email-verification__resend {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		align-items: flex-start;
	}

	.email-verification__action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		padding: 0 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--primary-foreground, 210 40% 98%));
		background: hsl(var(--primary, 222.2 47.4% 11.2%));
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.email-verification__action:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.email-verification__action:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.email-verification__action:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
