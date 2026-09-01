<script lang="ts">
	/**
	 * The page the provider redirects back to.
	 *
	 * Structurally this is `EmailVerification`: no form, work starts on mount,
	 * and a single-use credential is exchanged exactly once. Two stores, because
	 * finishing the callback *is* finishing the sign-in and a `SessionSnapshot`
	 * has to cross into the session store.
	 *
	 * **`onSuccess` is required**, which no sibling does. A callback URL is a
	 * page with no content of its own; a completed sign-in that does not navigate
	 * leaves a signed-in user parked on a URL that means nothing to them. Making
	 * it required turns forgotten wiring into a compile error rather than a
	 * confusing screen — the argument this package already makes for taking both
	 * stores. A consumer who genuinely wants to stay passes `() => {}` on purpose.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import { isMfaRequired } from '../errors/helpers.js';
	import type { MfaMethod } from '../deps.js';
	import type {
		OAuthCallbackAction,
		OAuthCallbackParams,
		OAuthCallbackState
	} from '../flows/oauth-callback/types.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: OAuthCallbackState;
			dispatch(action: OAuthCallbackAction): void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * The callback query, parsed — `oauthParamsFromUrl(window.location.href)`.
		 *
		 * `null` is a state worth rendering rather than an error: someone reached
		 * this URL directly, and the useful answer is a way back to sign-in.
		 */
		params?: OAuthCallbackParams | null | undefined;
		/** Where a completed sign-in goes. **Required** — see above. */
		onSuccess: (result: { returnTo: string | null }) => void;
		/**
		 * Where "start again" goes. **Required.**
		 *
		 * Every failure here is terminal — the authorization code is spent at the
		 * provider and the pending record consumed — so this is the only recovery
		 * there is, and a branch with nothing to click is the dead end this
		 * package has fixed three times.
		 */
		onStartOver: () => void;
		/**
		 * Called when the backend wants a second factor after the provider.
		 *
		 * A real branch, not a hypothetical: `completeOAuth` is documented to
		 * reject with `mfa_required` and `createHttpAuthDeps` already produces it.
		 * Without this the user lands on a banner telling them to enter a code,
		 * with nowhere to enter it — which is the exact species this whole feature
		 * exists to close. Optional, because most backends never send it.
		 */
		onMfaRequired?:
			| ((challenge: { challengeId: string; methods: readonly MfaMethod[] }) => void)
			| undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Replaces the completed panel. */
		completed?: Snippet<[{ returnTo: string | null }]> | undefined;
		/** Rendered on every branch — see the note by the markup. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		params = null,
		onSuccess,
		onStartOver,
		onMfaRequired,
		headingLevel = 2,
		completed,
		footer,
		class: className = ''
	}: Props = $props();

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const returnTo = $derived(flowStore.state.returnTo);

	/** Whether there is anything here to act on at all. */
	const hasCallback = $derived(
		params !== null && (params.code !== null || params.error !== null)
	);

	/**
	 * Whether the callback has been handed to the flow.
	 *
	 * Never reset: a page load is one attempt, and a fresh authorization code
	 * arrives only with a new page load, which destroys this store.
	 *
	 * Unlike `MfaEnrolment`'s flag this is **not** load-bearing — the reducer's
	 * `status !== 'idle'` guard is total, so a repeat dispatch is refused whatever
	 * happens here. And unlike `EmailVerification`'s it reads no status at all, so
	 * there is no `||` whose ordering could be quietly holding it up. That was a
	 * real defect last round.
	 */
	let dispatched = false;

	$effect(() => {
		if (dispatched) return;
		if (params === null) return;
		if (params.code === null && params.error === null) return;
		dispatched = true;
		flowStore.dispatch({ type: 'callbackReceived', params });
	});

	/** Whether the session has been handed over. */
	let handedOver = false;

	$effect(() => {
		if (handedOver) return;
		const state = flowStore.state;
		if (state.status !== 'completed' || state.session === null) return;
		handedOver = true;
		sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
	});

	/**
	 * Whether this challenge has been reported.
	 *
	 * Cleared whenever the flow is not sitting on an `mfa_required`, so it is
	 * "once per challenge" and not "once per distinct id". Keying on the id is
	 * the defect fixed in `LoginForm` last round: a backend returning the same
	 * pending challenge twice was reported once and the second attempt did
	 * nothing visible at all.
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

	/** The panel, focused when it replaces the working message. */
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'completed' || status === 'failed') panel?.focus();
	});

	/** A cancellation is the flow branching, not a failure. No red banner. */
	const isDenied = $derived(error?.code === 'oauth_denied');
	/** Suppressed while a consumer is routing to the second factor. */
	const handlingMfa = $derived(onMfaRequired !== undefined && isMfaRequired(error));
</script>

<div class="oauth-callback {className}">
	{#if !hasCallback}
		<svelte:element this={`h${headingLevel}`} class="oauth-callback__title">
			Nothing to finish here
		</svelte:element>
		<p class="oauth-callback__body">
			This page completes a sign-in that started somewhere else. Start again to sign in.
		</p>
		<button type="button" class="oauth-callback__action" onclick={() => onStartOver()}>
			Back to sign in
		</button>
	{:else if status === 'idle' || status === 'exchanging'}
		<svelte:element this={`h${headingLevel}`} class="oauth-callback__title">
			Finishing your sign-in
		</svelte:element>
		<p class="oauth-callback__body" role="status" aria-live="polite">One moment…</p>
	{:else if status === 'completed'}
		<div
			bind:this={panel}
			class="oauth-callback__panel"
			role="status"
			aria-live="polite"
			tabindex="-1"
		>
			{#if completed}
				{@render completed({ returnTo })}
			{:else}
				<svelte:element this={`h${headingLevel}`} class="oauth-callback__title">
					You're signed in
				</svelte:element>
				<p class="oauth-callback__body">Welcome back.</p>
			{/if}
			<!--
				Unconditional, and that is the point. A completed sign-in on a
				callback URL is a user parked somewhere meaningless; gating this
				button on anything is how that becomes a dead end.
			-->
			<button
				type="button"
				class="oauth-callback__action"
				onclick={() => onSuccess({ returnTo })}
			>
				Continue
			</button>
		</div>
	{:else if handlingMfa}
		<!-- The consumer is routing to the code prompt. Not a failure, so no alert. -->
		<svelte:element this={`h${headingLevel}`} class="oauth-callback__title">
			One more step
		</svelte:element>
		<p class="oauth-callback__body" role="status" aria-live="polite">
			Taking you to your second factor…
		</p>
	{:else}
		<div
			bind:this={panel}
			class="oauth-callback__panel"
			role={isDenied ? 'status' : 'alert'}
			aria-live="polite"
			tabindex="-1"
		>
			<svelte:element this={`h${headingLevel}`} class="oauth-callback__title">
				{isDenied ? 'Sign-in cancelled' : "We couldn't finish that sign-in"}
			</svelte:element>
			{#if error}
				<p
					class={isDenied ? 'oauth-callback__body' : 'oauth-callback__error'}
					data-error-code={error.code}
				>
					{error.message}
				</p>
			{/if}
			<button type="button" class="oauth-callback__action" onclick={() => onStartOver()}>
				{isDenied ? 'Try again' : 'Start again'}
			</button>
		</div>
	{/if}

	<!--
		Outside every branch, as `ForgotPasswordForm` renders its own. A footer is
		usually a way out — back to sign in, or someone to ask — and dropping it on
		a failure branch removes it exactly when the user is most stuck. That was a
		real defect in `MfaChallengeForm` last round.
	-->
	{#if footer}
		<div class="oauth-callback__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.oauth-callback {
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

	.oauth-callback__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.oauth-callback__panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.oauth-callback__panel:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
	}

	.oauth-callback__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.oauth-callback__error {
		margin: 0;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.oauth-callback__action {
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

	.oauth-callback__action:hover {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.oauth-callback__action:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.oauth-callback__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
