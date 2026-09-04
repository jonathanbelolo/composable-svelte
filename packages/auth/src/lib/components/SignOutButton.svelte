<script lang="ts">
	/**
	 * Signing out.
	 *
	 * **The first component in this package that dispatches to the session
	 * store.** `AuthGuard` and `RoleGate` both type their prop as
	 * `{ readonly state: SessionState }` with the same comment — "for a
	 * `dispatch` this component never calls" — and every flow component
	 * dispatches to a *flow* store instead. Signing out has no flow: the action
	 * already lives on the session reducer, and until now the only way to reach
	 * it was for a consumer to write `store.dispatch({ type: 'logout' })` by
	 * hand. Measured: `examples/` contained zero call sites.
	 *
	 * **Sign-out is fail-closed, and this surfaces that.** The reducer takes the
	 * client anonymous even when the request never reached the server, recording
	 * the failure in `SessionState.error` — because the cookie is HttpOnly and
	 * server-owned, so the client cannot verify the outcome either way. Before
	 * this, `AuthGuard`'s `fallback` was the only place that error could appear,
	 * and only after the UI had already switched to the signed-out view.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import type { SessionAction, SessionState } from '../session/types.js';

	interface Props {
		/**
		 * The session store. Both halves are used, which is what makes this
		 * component unlike the guards: `state` to know when a sign-out is in
		 * flight, `dispatch` to start one.
		 */
		store: {
			readonly state: SessionState;
			dispatch(action: SessionAction): void;
		};
		/** Called once the session has settled on anonymous. For navigation. */
		onSignedOut?: (() => void) | undefined;
		/** Replaces the label. */
		children?: Snippet | undefined;
		label?: string | undefined;
		/**
		 * Whether to report a sign-out that did not reach the server.
		 *
		 * On by default. The user is signed out locally either way, so this is
		 * not a failure they can act on — but it is the difference between "this
		 * device is signed out" and "every device is", and an app that hides it
		 * has told them something untrue.
		 */
		showFailure?: boolean | undefined;
		class?: string | undefined;
	}

	let {
		store,
		onSignedOut,
		children,
		label = 'Sign out',
		showFailure = true,
		class: className = ''
	}: Props = $props();

	const status = $derived(store.state.status);
	const isSigningOut = $derived(status === 'loggingOut');
	const error = $derived(store.state.error);

	/**
	 * Whether *this button* started the sign-out that is in flight.
	 *
	 * Load-bearing, and it took a probe to see why. `sessionResolveFailed`
	 * produces byte-identical state to a failed logout — `status: 'anonymous'`
	 * with an `error` — because both are fail-closed. So "the session became
	 * anonymous" does not mean "we signed out": a session endpoint that blips on
	 * page load lands in exactly the same place.
	 *
	 * Measured before this existed: mounting this button and letting a
	 * `resolveSession` fail called `onSignedOut` once, with nobody having pressed
	 * anything. A consumer navigating on that callback would throw the user out
	 * of the app on a transient failure.
	 *
	 * Reset when the session leaves `loggingOut`-or-`anonymous`, so it is once
	 * per sign-out rather than once per lifetime — the species fixed in
	 * `LoginForm` and again in `ForgotPasswordForm`.
	 *
	 * **`$state`, not a plain `let`** — unlike every other guard flag in this
	 * package. Those record what a component has already *done* and are read only
	 * inside effects, so they need no reactivity. This one is also read by the
	 * `$derived` below that decides whether to render the warning, and a plain
	 * `let` is invisible to a derived: the flag flipped, nothing recomputed, and
	 * the warning silently stopped appearing for real failures.
	 */
	let initiated = $state(false);

	/** Whether the sign-out this button started has been reported. */
	let reported = false;

	$effect(() => {
		const current = store.state.status;
		if (current !== 'anonymous') {
			// Still signing out is not yet done; anything else means a new session,
			// and the next press starts a fresh sign-out.
			// Guarded, because this writes state the effect also reads: an
			// unconditional assignment is a needless re-run at best.
			if (current !== 'loggingOut' && initiated) initiated = false;
			reported = false;
			return;
		}
		if (!initiated || reported) return;
		reported = true;
		onSignedOut?.();
	});

	/**
	 * A failure worth showing, and only for a sign-out this button started.
	 *
	 * `SessionState.error` is shared: a failed sign-in writes it, and so does a
	 * failed session *resolve* — which also settles on `anonymous`. Narrowing on
	 * status alone told someone whose session endpoint blipped that their
	 * sign-out might not have reached the server, about a sign-out that never
	 * happened.
	 */
	const failed = $derived(showFailure && initiated && status === 'anonymous' && error !== null);
</script>

<div class="sign-out {className}">
	<button
		type="button"
		class="sign-out__button"
		disabled={isSigningOut}
		onclick={() => {
			initiated = true;
			store.dispatch({ type: 'logout' });
		}}
	>
		{#if children}
			{@render children()}
		{:else}
			{isSigningOut ? 'Signing out…' : label}
		{/if}
	</button>

	<p class="sign-out__status" role="status" aria-live="polite">
		{isSigningOut ? 'Signing out…' : ''}
	</p>

	{#if failed && error}
		<!--
			`role="status"`, not `alert`. The user *is* signed out on this device;
			what failed is telling the server, and shouting about it would suggest
			the sign-out did not happen.
		-->
		<p class="sign-out__warning" role="status" aria-live="polite" data-error-code={error.code}>
			You're signed out on this device, but we couldn't reach the server — you may still be signed
			in elsewhere.
		</p>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.sign-out {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.sign-out__button {
		display: inline-flex;
		align-self: flex-start;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		padding: 0 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.sign-out__button:hover:not(:disabled) {
		background: hsl(var(--accent, 210 40% 96.1%));
	}

	.sign-out__button:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.sign-out__button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.sign-out__warning {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	/* Visually hidden, still announced. */
	.sign-out__status {
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
</style>
