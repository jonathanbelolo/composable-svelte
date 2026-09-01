<script lang="ts">
	/**
	 * The page a sign-in link lands on.
	 *
	 * **The token is spent when the user presses a button, never on mount**, and
	 * that is the whole design. Mail scanners and link prefetchers follow links
	 * before a person does; they issue a GET and never press anything. Auto-
	 * consuming — which is what `EmailVerification` does, correctly, for a much
	 * cheaper token — would mean a scanned mailbox kills the link before its owner
	 * sees it, and kills the replacement too.
	 *
	 * It also removes a whole class of defect. Nothing here dispatches from an
	 * effect, so there is no mount guard, no "has this token been handed over"
	 * flag, and none of the ordering subtleties those have cost this package.
	 *
	 * Two stores, because following the link *is* signing in and a
	 * `SessionSnapshot` has to cross into the session store.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import { isMfaRequired } from '../errors/helpers.js';
	import type { MfaMethod } from '../deps.js';
	import type {
		MagicLinkSignInAction,
		MagicLinkSignInState
	} from '../flows/magic-link-signin/types.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: MagicLinkSignInState;
			dispatch(action: MagicLinkSignInAction): void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * Who the link was for, if the surface knows.
		 *
		 * **Display only, and the consumer owns its provenance.** The token is
		 * opaque, so this component cannot learn the address from it; anything
		 * shown here came from somewhere else. Do not pass a value read straight
		 * out of the URL — it would be attacker-controlled text rendered in the
		 * application's own chrome, which is a phishing surface even though Svelte
		 * escapes it. Omitting it is a supported configuration.
		 */
		email?: string | null | undefined;
		/** Called once, after the session has been established. */
		onSuccess?: (() => void) | undefined;
		/**
		 * Where "ask for a new link" goes. **Required.**
		 *
		 * An expired or spent link cannot be retried from here, and a branch with
		 * nothing to click is a dead end — the same reasoning as
		 * `ResetPasswordForm`'s `onRequestNewLink`, which was optional until it
		 * silently stranded people.
		 */
		onRequestNewLink: () => void;
		/**
		 * Called when the backend wants a second factor after the link.
		 *
		 * A real branch: proving control of a mailbox is not proving possession of
		 * a device, and a backend may reasonably ask for both. Without this the
		 * user lands on a banner telling them to enter a code with nowhere to
		 * enter it.
		 */
		onMfaRequired?:
			| ((challenge: { challengeId: string; methods: readonly MfaMethod[] }) => void)
			| undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		/** Replaces the signed-in panel. */
		signedIn?: Snippet | undefined;
		/** Rendered on every branch. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		email = null,
		onSuccess,
		onRequestNewLink,
		onMfaRequired,
		headingLevel = 2,
		submitLabel = 'Sign in',
		signedIn,
		footer,
		class: className = ''
	}: Props = $props();

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const token = $derived(flowStore.state.token);
	const isSubmitting = $derived(status === 'submitting');

	/** Whether the session has been handed over. */
	let handedOver = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'succeeded') {
			handedOver = false;
			return;
		}
		if (handedOver || state.session === null) return;
		handedOver = true;
		sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		onSuccess?.();
	});

	/**
	 * Whether this challenge has been reported.
	 *
	 * Cleared whenever the flow is not sitting on an `mfa_required`, so it is once
	 * per challenge rather than once per distinct id — the defect fixed in
	 * `LoginForm`, where a backend returning the same pending challenge twice was
	 * reported once and the second attempt did nothing visible.
	 */
	let reportedChallenge = false;

	$effect(() => {
		const current = flowStore.state.error;
		if (onMfaRequired === undefined || !isMfaRequired(current)) {
			reportedChallenge = false;
			return;
		}
		if (reportedChallenge) return;
		reportedChallenge = true;
		onMfaRequired({ challengeId: current.challengeId, methods: current.methods });
	});

	/** The panel, focused when it replaces the offer. */
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'succeeded') panel?.focus();
	});

	/**
	 * Whether the link is unusable — missing, or refused as spent.
	 *
	 * Both end in the same offer, so they share a branch and the button is
	 * withdrawn rather than left up to fail again. Other failures are *not* in
	 * here: a network blip may mean the request never arrived and the token is
	 * untouched, so pressing again is a real recovery and the button must stay.
	 */
	const linkIsDead = $derived(token === null || error?.code === 'token_expired');

	/** Suppressed while a consumer routes to the second factor. */
	const handlingMfa = $derived(onMfaRequired !== undefined && isMfaRequired(error));
</script>

<div class="magic-signin {className}">
	{#if status === 'succeeded'}
		<div
			bind:this={panel}
			class="magic-signin__panel"
			role="status"
			aria-live="polite"
			tabindex="-1"
		>
			{#if signedIn}
				{@render signedIn()}
			{:else}
				<svelte:element this={`h${headingLevel}`} class="magic-signin__title">
					You're signed in
				</svelte:element>
				<p class="magic-signin__body">Welcome back.</p>
			{/if}
		</div>
	{:else if linkIsDead}
		<svelte:element this={`h${headingLevel}`} class="magic-signin__title">
			{token === null ? 'Nothing to sign in with' : 'That link has expired'}
		</svelte:element>
		{#if error}
			<div
				class="magic-signin__error"
				role="alert"
				aria-live="polite"
				data-error-code={error.code}
			>
				{error.message}
			</div>
		{:else}
			<p class="magic-signin__body">
				Sign-in links work once and expire quickly. Ask for a fresh one to continue.
			</p>
		{/if}
		<button type="button" class="magic-signin__action" onclick={() => onRequestNewLink()}>
			Send me a new link
		</button>
	{:else if handlingMfa}
		<!-- The consumer is routing to the code prompt. Not a failure, so no alert. -->
		<svelte:element this={`h${headingLevel}`} class="magic-signin__title">
			One more step
		</svelte:element>
		<p class="magic-signin__body" role="status" aria-live="polite">
			Taking you to your second factor…
		</p>
	{:else}
		<svelte:element this={`h${headingLevel}`} class="magic-signin__title">
			Sign in
		</svelte:element>

		<!--
			The press is the point. A mail scanner opening this page issues a GET
			and stops here, leaving the token unspent for whoever the mail was
			actually for.
		-->
		<p class="magic-signin__body">
			{#if email}
				Continue as <strong>{email}</strong> on this device.
			{:else}
				Press the button to finish signing in on this device.
			{/if}
		</p>

		{#if error}
			<div
				class="magic-signin__error"
				role="alert"
				aria-live="polite"
				data-error-code={error.code}
			>
				{error.message}
			</div>
		{/if}

		<p class="magic-signin__status" role="status" aria-live="polite">
			{isSubmitting ? 'Signing you in…' : ''}
		</p>

		<button
			type="button"
			class="magic-signin__action"
			disabled={isSubmitting}
			onclick={() => flowStore.dispatch({ type: 'signInRequested' })}
		>
			{isSubmitting ? 'Signing in…' : submitLabel}
		</button>
	{/if}

	<!--
		Outside every branch, as `ForgotPasswordForm` renders its own: a footer is
		usually a way out, and dropping it on the dead-link branch removes it
		exactly when the user is most stuck.
	-->
	{#if footer}
		<div class="magic-signin__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.magic-signin {
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

	.magic-signin__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.magic-signin__panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.magic-signin__panel:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
	}

	.magic-signin__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.magic-signin__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.magic-signin__status {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		white-space: nowrap;
		border: 0;
		clip-path: inset(50%);
	}

	.magic-signin__action {
		display: inline-flex;
		align-self: flex-start;
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

	.magic-signin__action:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.magic-signin__action:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.magic-signin__action:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.magic-signin__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
