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

	import type {
		EmailVerificationAction,
		EmailVerificationState
	} from '../flows/email-verification/types.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: EmailVerificationState;
			dispatch(action: EmailVerificationAction): void;
		};
		/** Where a session is handed over, when confirming issued one. */
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * The confirmation token from the link, or `null` when there is none.
		 *
		 * `null` is a state worth rendering rather than an error: someone reached
		 * this page directly, or a mail client mangled the link, and the useful
		 * answer is an offer to resend.
		 */
		token?: string | null | undefined;
		/** Called once, after a session has been established. */
		onSuccess?: (() => void) | undefined;
		/** Offered once the address is confirmed but no session was issued. */
		onSignIn?: (() => void) | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Replaces the confirmed panel. Receives whether a session was issued. */
		verified?: Snippet<[{ signedIn: boolean }]> | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		token = null,
		onSuccess,
		onSignIn,
		headingLevel = 2,
		verified,
		class: className = ''
	}: Props = $props();

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const session = $derived(flowStore.state.session);
	const email = $derived(flowStore.state.email);
	const resendStatus = $derived(flowStore.state.resendStatus);
	const resendError = $derived(flowStore.state.resendError);

	/**
	 * The token this component has already asked about.
	 *
	 * A plain `let`, per the animation-guard convention. The reducer refuses a
	 * second exchange as well, and both guards are wanted: this one stops the
	 * dispatch, that one stops anything that gets past it. A confirmation token
	 * is single-use, so a duplicate exchange turns a working link into a spent
	 * one and blames the user for it.
	 */
	let requested: string | null = null;

	$effect(() => {
		if (token === null || token === requested) return;
		requested = token;
		flowStore.dispatch({ type: 'verificationRequested', token });
	});

	/** Whether the session produced by confirming has been handed over. */
	let handedOver = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'verified') {
			handedOver = false;
			return;
		}
		if (handedOver || state.session === null) return;
		handedOver = true;
		sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		onSuccess?.();
	});

	/** Focused when a terminal panel replaces whatever was there. */
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'verified') panel?.focus();
	});
</script>

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
				{#if session === null && onSignIn}
					<button type="button" class="email-verification__action" onclick={() => onSignIn()}>
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
					onclick={() => flowStore.dispatch({ type: 'resendRequested' })}
				>
					{resendStatus === 'sending' ? 'Sending…' : 'Send another link'}
				</button>
			</div>
		{/if}
	{/if}
</div>

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
