<script lang="ts">
	/**
	 * The providers attached to the account.
	 *
	 * Two stores, but not for the usual reason. `connectedAccountsStore` detaches;
	 * `oauthStore` attaches, and attaching is `oauth-start` with `intent: 'link'`
	 * — the same redirect, the same pending record, the same callback that two
	 * rounds of review have already hardened. A second link flow would drift from
	 * it, so there is not one.
	 *
	 * In managed mode, accepts genuine PresentationView ports for connected accounts,
	 * the account read model, and optional OAuth start, or an explicit `onLink` port.
	 *
	 * **No provider logos ship** — see `OAuthSignIn` for why — so labels come from
	 * `available`, and a linked provider that is not in that list falls back to
	 * its id rather than disappearing.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';
	import type { PresentationView } from '@composable-svelte/core/application';

	import { isReauthenticationRequired } from '../errors/helpers.js';
	import type {
		ConnectedAccountsAction,
		ConnectedAccountsState
	} from '../flows/connected-accounts/types.js';
	import type { AccountAction, AccountState } from '../flows/account/types.js';
	import type { OAuthStartAction, OAuthStartState } from '../flows/oauth-start/types.js';
	import type { OAuthProvider } from '../flows/oauth-pending.js';

	interface ProviderOption {
		id: OAuthProvider;
		label: string;
	}

	interface StandaloneBinding {
		mode?: 'standalone' | undefined;
		store: {
			readonly state: ConnectedAccountsState;
			dispatch(action: ConnectedAccountsAction): void;
		};
		/** Optional standalone account read model. */
		accountStore?: {
			readonly state: AccountState;
			dispatch(action: AccountAction): void;
		} | undefined;
		/** The redirect half. Attaching a provider goes through `oauth-start`. */
		oauthStore?: {
			readonly state: OAuthStartState;
			dispatch(action: OAuthStartAction): void;
		} | undefined;
		/** Optional link action port. */
		onLink?: ((provider: OAuthProvider) => void) | undefined;
		/**
		 * What is attached now, from `fetchAccount`.
		 *
		 * `undefined` means not known yet, and the panel says so rather than
		 * rendering an empty list — "no accounts connected" is a claim, and making
		 * it before the read lands is a false one.
		 */
		providers?: readonly string[] | undefined;
		/**
		 * Whether the account has a password, from `fetchAccount`.
		 *
		 * Used only for the advisory below. **It never disables anything** — see
		 * the flow's own doc for why a client-side "is this the last way in" rule
		 * is wrong, and why the backend is the one that refuses.
		 */
		hasPassword?: boolean | undefined;
		/** Where to land after attaching. Normalised to a same-origin path or dropped. */
		returnTo?: string | null | undefined;
		/** Called after a provider is detached, so the surface can re-read the account. */
		onUnlinked?: (() => void) | undefined;
		/** Called when the backend wants the user to confirm it is still them. */
		onReauthenticationRequired?:
			| ((demand: {
					provider: string;
					methods: readonly ('password' | 'totp' | 'recovery_code')[];
			  }) => void)
			| undefined;
	}

	interface ManagedBinding {
		mode: 'managed';
		/** The connected-accounts (unlink) presentation view from createAuthFeature. */
		store: PresentationView<ConnectedAccountsState, ConnectedAccountsAction>;
		/**
		 * Optional account view from createAuthFeature.
		 * When provided, providers and hasPassword derive directly from accountStore.state.account,
		 * and accountRequested is dispatched once on client mount if idle.
		 */
		accountStore?: PresentationView<AccountState, AccountAction> | undefined;
		/**
		 * Optional oauthStart presentation view from createAuthFeature.
		 * When live, authorizationRequested can be dispatched directly through it.
		 */
		oauthStore?: PresentationView<OAuthStartState, OAuthStartAction> | undefined;
		/**
		 * Supported managed link action / port: called when a user wants to link a provider.
		 * Allows parent to open or restart oauthStart as needed without violating genuine-view typing.
		 */
		onLink?: ((provider: OAuthProvider) => void) | undefined;
		providers?: readonly string[] | undefined;
		hasPassword?: boolean | undefined;
		returnTo?: string | null | undefined;
		onUnlinked?: never;
		onReauthenticationRequired?: never;
	}

	interface PresentationProps {
		/**
		 * The providers this app offers, in order. This package ships no list.
		 *
		 * Same shape as `OAuthSignIn` takes, so a surface declares its providers
		 * once and passes the same array to both.
		 */
		available?: readonly ProviderOption[] | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Rendered below the panel. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	type Props = (StandaloneBinding | ManagedBinding) & PresentationProps;

	let {
		available = [],
		headingLevel = 2,
		footer,
		class: className = '',
		...binding
	}: Props = $props();

	const owner = $derived(binding.store);
	const viewOf = (key: typeof binding.store) => key;

	/** `undefined` only for a managed view whose owner has retired. */
	const flow: ConnectedAccountsState | undefined = $derived(binding.store.state);
	const status = $derived(flow?.status);
	const error = $derived(flow?.error ?? null);
	const busyProvider = $derived(status === 'unlinking' ? (flow?.provider ?? null) : null);

	const accountState = $derived(binding.accountStore?.state);
	const accountSnapshot = $derived(accountState?.account ?? null);
	const accountError = $derived(accountState?.error ?? null);
	const accountStatus = $derived(accountState?.status);

	/**
	 * Client-side mount effect for starting account read once per mounted view.
	 * Never runs during SSR.
	 */
	let startedAccountRead = false;
	let startedAccountOwner: unknown = null;

	$effect(() => {
		const accStore = binding.accountStore;
		if (!accStore) return;
		const accOwner = accStore;
		if (accOwner !== startedAccountOwner) {
			startedAccountOwner = accOwner;
			startedAccountRead = false;
		}
		if (startedAccountRead) return;
		const state = accStore.state;
		if (state === undefined || state.status !== 'idle') return;
		startedAccountRead = true;
		accStore.dispatch({ type: 'accountRequested' });
	});

	/**
	 * Truthful resolution of providers and password status.
	 * If accountStore is passed, derives strictly from snapshot (undefined before read lands).
	 */
	const effectiveProviders = $derived(
		binding.accountStore !== undefined
			? (accountSnapshot?.providers ?? undefined)
			: binding.providers
	);

	const effectiveHasPassword = $derived(
		binding.accountStore !== undefined
			? (accountSnapshot?.hasPassword ?? undefined)
			: binding.hasPassword
	);

	/**
	 * Tell the flow what the account currently reports.
	 *
	 * This is what stops `unlinked` outliving its purpose. Without it a provider
	 * detached and then re-attached stays hidden forever: it is missing from
	 * `linked`, so there is no Disconnect row, *and* present in `linkable`, so
	 * the panel offers to connect something already connected.
	 */
	let lastObservedProviders: readonly string[] | undefined = undefined;
	let lastObservedOwner: unknown = null;
	let lastObservedUnlinkedLength = 0;

	$effect(() => {
		const key = owner;
		const currentProviders = effectiveProviders;
		if (currentProviders === undefined) return;
		if (key !== lastObservedOwner) {
			lastObservedOwner = key;
			lastObservedProviders = undefined;
			lastObservedUnlinkedLength = 0;
		}
		const unlinked = flow?.unlinked ?? [];
		const providersMatch =
			lastObservedProviders !== undefined &&
			lastObservedProviders.length === currentProviders.length &&
			lastObservedProviders.every((p, i) => p === currentProviders[i]);
		const unlinkedUnchanged = unlinked.length === lastObservedUnlinkedLength;

		if (providersMatch && unlinkedUnchanged) {
			return;
		}

		lastObservedProviders = currentProviders;
		lastObservedUnlinkedLength = unlinked.length;
		const view = viewOf(key);
		view.dispatch({ type: 'providersObserved', providers: currentProviders });
	});

	/**
	 * What is attached, as far as anyone here knows.
	 *
	 * The account minus what this session has already detached. The subtraction
	 * is what stops a detached row lingering — and offering a second click that
	 * can only fail — in the window before the surface's re-read lands. The
	 * effect above is what keeps that subtraction from becoming permanent.
	 */
	const linked = $derived(
		effectiveProviders === undefined
			? null
			: effectiveProviders.filter((id) => !(flow?.unlinked.includes(id) ?? false))
	);

	const labelFor = (id: string): string =>
		available.find((option) => option.id === id)?.label ?? id;

	/** Offered for attaching: everything this app has that is not attached already. */
	const linkable = $derived(
		linked === null ? [] : available.filter((option) => !linked.includes(option.id))
	);

	/**
	 * Whether to warn that this looks like the only way in.
	 *
	 * **Advisory, never a block.** A magic link is also a way in and nothing in
	 * `AccountSnapshot` says whether the backend offers them, so a rule that
	 * disabled the button would lock out every magic-link account. What is said
	 * here is true regardless: there is one provider and no password.
	 */
	const isLastWayIn = $derived(effectiveHasPassword === false && linked !== null && linked.length === 1);

	/** The redirect half's own trouble, which belongs beside the link buttons. */
	const linkError = $derived(binding.oauthStore?.state?.error ?? null);
	const linkingProvider = $derived(
		binding.oauthStore?.state?.status === 'starting' || binding.oauthStore?.state?.status === 'redirecting'
			? (binding.oauthStore?.state?.provider ?? null)
			: null
	);

	/**
	 * Track which detached provider identities have been reported (standalone only).
	 *
	 * Semantic event identity tracking rather than a simple count: `unlinked`
	 * is pruned by `providersObserved` once an account re-read lands, so a count
	 * check would spuriously re-trigger on decreases or fail on replacements.
	 */
	let reportedUnlinked = new Set<string>();

	$effect(() => {
		if (binding.mode === 'managed') return;
		const currentUnlinked = flow?.unlinked ?? [];
		let newlyUnlinked = false;
		for (const provider of currentUnlinked) {
			if (!reportedUnlinked.has(provider)) {
				newlyUnlinked = true;
				break;
			}
		}
		reportedUnlinked = new Set(currentUnlinked);
		if (newlyUnlinked) {
			binding.onUnlinked?.();
		}
	});

	/** Once per demand, not once per distinct provider — the `LoginForm` species (standalone only). */
	let reportedDemand = false;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const state = flow;
		if (!state) return;
		const current = state.error;
		if (
			binding.onReauthenticationRequired === undefined ||
			!isReauthenticationRequired(current) ||
			state.provider === null
		) {
			reportedDemand = false;
			return;
		}
		if (reportedDemand) return;
		reportedDemand = true;
		binding.onReauthenticationRequired({ provider: state.provider, methods: current.methods });
	});

	const handlesReauth = $derived(
		binding.mode !== 'managed' && binding.onReauthenticationRequired !== undefined
	);

	const showsError = $derived(
		error !== null &&
			!(handlesReauth && isReauthenticationRequired(error))
	);

	function link(key: typeof binding.store, provider: OAuthProvider) {
		if (key.state === undefined) return;
		if (binding.onLink !== undefined) {
			binding.onLink(provider);
			return;
		}
		const oauth = binding.oauthStore;
		if (oauth && oauth.state !== undefined) {
			oauth.dispatch({
				type: 'authorizationRequested',
				provider,
				intent: 'link',
				returnTo: binding.returnTo ?? null
			});
		}
	}

	const canLink = $derived(
		binding.onLink !== undefined || (binding.oauthStore !== undefined && binding.oauthStore.state !== undefined)
	);
	const isLinkDisabled = $derived(linkingProvider !== null || !canLink);
</script>

{#if flow}
	{#each [owner] as key (key)}
		<div class="connected-accounts {className}">
			<svelte:element this={`h${headingLevel}`} class="connected-accounts__title">
				Connected accounts
			</svelte:element>

			{#if showsError && error}
				<div
					class="connected-accounts__error"
					role="alert"
					aria-live="polite"
					data-error-code={error.code}
				>
					{error.message}
				</div>
			{/if}

			{#if accountError}
				<div
					class="connected-accounts__error"
					role="alert"
					aria-live="polite"
					data-error-code={accountError.code}
				>
					{accountError.message}
				</div>
			{/if}

			{#if linkError}
				<!--
					The redirect half's failure, rendered here rather than left to the
					`OAuthSignIn` that is not on this page. Without it, pressing Connect and
					having the backend refuse produces a button that goes back to normal and
					says nothing.
				-->
				<div
					class="connected-accounts__error"
					role="alert"
					aria-live="polite"
					data-error-code={linkError.code}
				>
					{linkError.message}
				</div>
			{/if}

			{#if linked === null}
				{#if binding.accountStore !== undefined && accountState === undefined}
					<p class="connected-accounts__body" role="status" aria-live="polite">
						Account details are unavailable.
					</p>
				{:else if accountStatus === 'failed'}
					<p class="connected-accounts__body" role="status" aria-live="polite">
						Could not load account details.
						<button
							type="button"
							class="connected-accounts__secondary"
							onclick={() => {
								if (key.state === undefined) return;
								binding.accountStore?.dispatch({ type: 'reloadRequested' });
							}}
						>
							Try again
						</button>
					</p>
				{:else}
					<p class="connected-accounts__body" role="status" aria-live="polite">
						Reading your account…
					</p>
				{/if}
			{:else}
				{#if linked.length === 0}
					<p class="connected-accounts__body">
						No accounts are connected. Connecting one adds another way to sign in.
					</p>
				{:else}
					<ul class="connected-accounts__list">
						{#each linked as provider (provider)}
							<li class="connected-accounts__row">
								<span class="connected-accounts__name">{labelFor(provider)}</span>
								<button
									type="button"
									class="connected-accounts__destructive"
									disabled={status === 'unlinking'}
									onclick={() => viewOf(key).dispatch({ type: 'unlinkRequested', provider })}
								>
									{busyProvider === provider ? 'Disconnecting…' : 'Disconnect'}
								</button>
							</li>
						{/each}
					</ul>

					{#if isLastWayIn}
						<!--
							Said, not enforced. See `isLastWayIn` and the flow's doc: the client
							cannot know whether the backend offers magic links, so a disabled
							button here would be wrong for every backend that does.
						-->
						<p class="connected-accounts__note">
							This is the only account connected, and you have no password. If you disconnect it,
							make sure you can still sign in another way.
						</p>
					{/if}
				{/if}

				{#if linkable.length > 0}
					<div class="connected-accounts__row connected-accounts__row--wrap">
						{#each linkable as option (option.id)}
							<button
								type="button"
								class="connected-accounts__secondary"
								disabled={isLinkDisabled}
								title={!canLink ? 'Connecting a provider is currently unavailable' : undefined}
								onclick={() => link(key, option.id)}
							>
								{linkingProvider === option.id ? 'Taking you there…' : `Connect ${option.label}`}
							</button>
						{/each}
					</div>
				{/if}
			{/if}

			<p class="connected-accounts__status" role="status" aria-live="polite">
				{busyProvider === null ? '' : `Disconnecting ${labelFor(busyProvider)}…`}
			</p>

			{#if footer}
				<div class="connected-accounts__footer">{@render footer()}</div>
			{/if}
		</div>
	{/each}
{/if}

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.connected-accounts {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 28rem;
	}

	.connected-accounts__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.connected-accounts__body,
	.connected-accounts__note {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.connected-accounts__note {
		font-size: 0.8125rem;
	}

	.connected-accounts__list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.connected-accounts__row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		justify-content: space-between;
	}

	.connected-accounts__row--wrap {
		flex-wrap: wrap;
		justify-content: flex-start;
	}

	.connected-accounts__name {
		font-size: 0.875rem;
		font-weight: 500;
	}

	.connected-accounts__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.connected-accounts__secondary,
	.connected-accounts__destructive {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.25rem;
		padding: 0 0.875rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.connected-accounts__secondary {
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: transparent;
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
	}

	.connected-accounts__secondary:hover:not(:disabled) {
		background: hsl(var(--muted, 210 40% 96.1%));
	}

	.connected-accounts__destructive {
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: transparent;
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.4);
	}

	.connected-accounts__destructive:hover:not(:disabled) {
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
	}

	.connected-accounts__secondary:focus-visible,
	.connected-accounts__destructive:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.connected-accounts__secondary:disabled,
	.connected-accounts__destructive:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.connected-accounts__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	/* Visually hidden, still announced. */
	.connected-accounts__status {
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
