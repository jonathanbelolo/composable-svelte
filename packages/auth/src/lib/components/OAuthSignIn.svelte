<script lang="ts">
	/**
	 * The provider buttons.
	 *
	 * **No `sessionStore`**, unlike every other flow component here that can end
	 * in a session. That looks like an omission and is not: starting an OAuth
	 * sign-in establishes nothing. The session crosses on a different page, in a
	 * different store, after a full-page redirect — see `OAuthCallback`.
	 *
	 * **No provider logos ship**, and the `icon` snippet takes their place. Same
	 * reasoning as `MfaEnrolment`'s `qr` snippet — nothing in this repository
	 * ships third-party SVG and there is no precedent for a satellite package
	 * computing it — plus one that is specific to this feature: Google, GitHub,
	 * Apple and Microsoft each publish brand guidelines governing the mark, its
	 * clear space, the button colour and the wording. Vendoring their marks into
	 * an MIT package would make every consumer's trademark compliance this
	 * library's problem, and this library cannot review their usage. The `label`
	 * is the consumer's for the same reason.
	 *
	 * Without the snippet a button renders label-only, which is a supported
	 * configuration and not a degraded one.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import type { OAuthProvider } from '../flows/oauth-pending.js';
	import type { OAuthStartAction, OAuthStartState } from '../flows/oauth-start/types.js';

	interface Props {
		flowStore: {
			readonly state: OAuthStartState;
			dispatch(action: OAuthStartAction): void;
		};
		/**
		 * The providers to offer, in order.
		 *
		 * This package ships no list. Which providers exist is the backend's
		 * business, and a default here would be a guess that reads as a promise.
		 */
		providers: readonly { id: OAuthProvider; label: string }[];
		/**
		 * Where to land after signing in.
		 *
		 * Normalised to a same-origin path before it is stored — an absolute URL
		 * is dropped rather than followed. A consumer reading this from their own
		 * `?returnTo=` is the ordinary case, and that is exactly the route an
		 * open redirect would take.
		 */
		returnTo?: string | null | undefined;
		/** The provider's mark, if the consumer has one. See above. */
		icon?: Snippet<[{ provider: { id: OAuthProvider; label: string } }]> | undefined;
		/** Replaces the heading. */
		header?: Snippet | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		providers,
		returnTo = null,
		icon,
		header,
		headingLevel = 2,
		class: className = ''
	}: Props = $props();

	const status = $derived(flowStore.state.status);
	const inFlight = $derived(flowStore.state.provider);
	const error = $derived(flowStore.state.error);

	/**
	 * Whether *this* provider is the one being worked on.
	 *
	 * Derived from the pair, never from a shared flag. One boolean across four
	 * buttons disables all four and names none of them — the same defect shape as
	 * the single `copied` flag `MfaEnrolment` was carrying for two different
	 * things.
	 */
	const busy = (id: OAuthProvider): boolean => inFlight === id && status !== 'idle';

	/**
	 * A button is disabled only while its own request is open.
	 *
	 * The asymmetry with `redirecting` is deliberate and both halves have a
	 * reason. Disabled during `starting`, because a second press there is pure
	 * noise and the repo's rule is that in-flight controls are genuinely disabled
	 * rather than merely relabelled. **Enabled during `redirecting`**, because
	 * that status is left only by a navigation — if the navigation is slow,
	 * blocked, or simply does not happen, a disabled button is a permanent trap
	 * with no way out. Pressing again costs one superseded request.
	 */
	const disabled = (id: OAuthProvider): boolean => inFlight === id && status === 'starting';

	function choose(id: OAuthProvider) {
		flowStore.dispatch({ type: 'authorizationRequested', provider: id, returnTo });
	}
</script>

<div class="oauth-signin {className}">
	<!--
		The error sits outside the provider list, so it is still shown if the list
		is ever empty, and the list is still shown when there is an error — there
		is no branch here on which nothing is clickable.
	-->
	{#if error}
		<div class="oauth-signin__error" role="alert" aria-live="polite" data-error-code={error.code}>
			{error.message}
		</div>
	{/if}

	{#if providers.length > 0}
		{#if header}
			{@render header()}
		{:else}
			<svelte:element this={`h${headingLevel}`} class="oauth-signin__title">
				Or continue with
			</svelte:element>
		{/if}

		<ul class="oauth-signin__list">
			{#each providers as provider (provider.id)}
				<li>
					<!--
						A `<button>`, never an `<a href>`. Two reasons: the authorize URL
						does not exist until `beginOAuth` answers, so there is nothing to
						put in an `href`; and a ctrl-click on a link would open the
						authorize page in a new tab, whose `sessionStorage` is a *copy*
						taken at open time — so the record written afterwards would be
						written into the wrong tab and the callback could never verify it.
					-->
					<button
						type="button"
						class="oauth-signin__button"
						disabled={disabled(provider.id)}
						onclick={() => choose(provider.id)}
					>
						{#if icon}
							<span class="oauth-signin__icon" aria-hidden="true">
								{@render icon({ provider })}
							</span>
						{/if}
						<span>
							{#if busy(provider.id)}
								{status === 'redirecting' ? `Taking you to ${provider.label}…` : 'Connecting…'}
							{:else}
								Continue with {provider.label}
							{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<p class="oauth-signin__status" role="status" aria-live="polite">
		{busy(inFlight ?? '') && inFlight !== null ? `Connecting to ${inFlight}…` : ''}
	</p>
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.oauth-signin {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 100%;
	}

	.oauth-signin__title {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.oauth-signin__list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.oauth-signin__button {
		display: inline-flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: center;
		width: 100%;
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

	.oauth-signin__button:hover:not(:disabled) {
		background: hsl(var(--accent, 210 40% 96.1%));
	}

	.oauth-signin__button:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.oauth-signin__button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.oauth-signin__icon {
		display: inline-flex;
		align-items: center;
	}

	.oauth-signin__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.oauth-signin__status {
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
