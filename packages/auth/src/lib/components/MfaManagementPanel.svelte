<script lang="ts">
	/**
	 * The authenticator settings panel.
	 *
	 * Reads the account rather than fetching it — the spine's decision that this
	 * package ships panels, not a shell. Turning MFA *on* is `MfaEnrolment`, and
	 * this panel says so rather than embedding it: enrolment needs its own store,
	 * its own mount effect and a code to type, and a panel that quietly grew all
	 * three would be a second enrolment implementation.
	 *
	 * One store, not two. Neither operation can produce a `SessionSnapshot`, so
	 * there is nothing to hand over — the reason its siblings take a session
	 * store does not apply.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	import RecoveryCodes from './RecoveryCodes.svelte';
	import { isReauthenticationRequired } from '../errors/helpers.js';
	import type {
		MfaManagementAction,
		MfaManagementState,
		MfaOperation
	} from '../flows/mfa-management/types.js';

	interface Props {
		store: {
			readonly state: MfaManagementState;
			dispatch(action: MfaManagementAction): void;
		};
		/**
		 * Whether the account has an authenticator, from `fetchAccount`.
		 *
		 * `undefined` means not known yet, and the panel then says so rather than
		 * guessing — unlike `ChangePasswordForm`, which can default its wording
		 * because both of its branches offer the same button. Here the two
		 * branches offer *different* buttons, and guessing wrong would put a
		 * "Turn off" next to an authenticator that was never on.
		 */
		mfaEnabled?: boolean | undefined;
		/** Called after either operation succeeds, so the surface can re-read the account. */
		onChanged?: (() => void) | undefined;
		/**
		 * Called when the backend wants the user to confirm it is still them.
		 *
		 * Carries which operation was refused, because a prompt on another screen
		 * cannot recover "whichever button they pressed" — and coming back to a
		 * panel that has forgotten what you were doing is its own dead end.
		 */
		onReauthenticationRequired?:
			| ((demand: {
					operation: MfaOperation;
					methods: readonly ('password' | 'totp' | 'recovery_code')[];
			  }) => void)
			| undefined;
		/** Rendered on the off branch, where turning it on lives. */
		enrol?: Snippet | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/** Rendered below the panel on every branch. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		store,
		mfaEnabled,
		onChanged,
		onReauthenticationRequired,
		enrol,
		headingLevel = 2,
		footer,
		class: className = ''
	}: Props = $props();

	const status = $derived(store.state.status);
	const error = $derived(store.state.error);
	const operation = $derived(store.state.operation);
	const recoveryCodes = $derived(store.state.recoveryCodes);

	const isDisabling = $derived(status === 'disabling');
	const isRegenerating = $derived(status === 'regenerating');
	const isBusy = $derived(isDisabling || isRegenerating);

	/**
	 * The last value actually reported, so only a *change* is reported onward.
	 *
	 * Not `$state`: nothing renders from it, and making it reactive would put
	 * the effect below in a loop with itself.
	 */
	let lastObserved: boolean | undefined = undefined;

	/**
	 * Tell the flow when the account's answer **changes**.
	 *
	 * `disabled` is this store's memory of an operation it performed, and a
	 * newer account read outranks it — a surface that keeps one store across an
	 * enrolment, as the reference client does, would otherwise go on rendering
	 * the off branch for an account that has just turned two-factor back on.
	 *
	 * **Only on a change, though**, and that distinction is the whole of it. The
	 * effect re-runs whenever the store settles, and dispatching the *unchanged*
	 * prop each time would let the stale `true` still sitting in props undo the
	 * disable the moment it succeeded — which is exactly what the first version
	 * of this did, caught by the two tests that assert the panel stops claiming
	 * two-factor is on before the account has been re-read.
	 *
	 * `connected-accounts` needs no equivalent because its reconciliation is
	 * content-based: pruning against a stale provider list is a no-op, where
	 * resetting a status against a stale boolean is not.
	 */
	$effect(() => {
		const current = mfaEnabled;
		if (current === undefined || current === lastObserved) return;
		lastObserved = current;
		store.dispatch({ type: 'mfaObserved', enabled: current });
	});

	/**
	 * Whether the authenticator is off.
	 *
	 * The flow's own `disabled` is read *as well as* the account, because the
	 * account lags: a surface re-reads it on success, and until that lands a
	 * panel trusting `mfaEnabled` alone would still be offering to turn off
	 * something that is already off.
	 */
	const isOff = $derived(status === 'disabled' || mfaEnabled === false);
	const isUnknown = $derived(status !== 'disabled' && mfaEnabled === undefined);

	/** Whether the outcome has been reported. Cleared so a second one still reports. */
	let reportedChange = false;

	$effect(() => {
		const state = store.state;
		// The two successes: MFA is off, or a fresh set of codes is on screen.
		// `recoveryCodes` is cleared when either operation starts, so this cannot
		// re-fire for the same set.
		const succeeded = state.status === 'disabled' || state.recoveryCodes !== null;
		if (!succeeded) {
			reportedChange = false;
			return;
		}
		if (reportedChange) return;
		reportedChange = true;
		onChanged?.();
	});

	/**
	 * Whether this demand has been reported.
	 *
	 * Cleared whenever the flow is not sitting on one, so it is once per demand
	 * rather than once per distinct anything — the species fixed in `LoginForm`.
	 */
	let reportedDemand = false;

	$effect(() => {
		const state = store.state;
		const current = state.error;
		if (
			onReauthenticationRequired === undefined ||
			!isReauthenticationRequired(current) ||
			state.operation === null
		) {
			reportedDemand = false;
			return;
		}
		if (reportedDemand) return;
		reportedDemand = true;
		onReauthenticationRequired({ operation: state.operation, methods: current.methods });
	});

	/**
	 * Whether the error should be shown as a failure.
	 *
	 * A demand a consumer is handling is not one — they are routing to a prompt,
	 * and a red "something went wrong" on the way there is both wrong and
	 * alarming. The `mfa_required` lesson.
	 */
	const showsError = $derived(
		error !== null &&
			!(onReauthenticationRequired !== undefined && isReauthenticationRequired(error))
	);
</script>

<div class="mfa-management {className}">
	<svelte:element this={`h${headingLevel}`} class="mfa-management__title">
		Two-factor authentication
	</svelte:element>

	{#if showsError && error}
		<div class="mfa-management__error" role="alert" aria-live="polite" data-error-code={error.code}>
			{error.message}
			{#if operation === 'disable'}
				<span class="mfa-management__error-context">Nothing was turned off.</span>
			{:else if operation === 'regenerate'}
				<span class="mfa-management__error-context">Your existing codes still work.</span>
			{/if}
		</div>
	{/if}

	{#if isUnknown}
		<p class="mfa-management__body" role="status" aria-live="polite">
			Reading your account…
		</p>
	{:else if isOff}
		<p class="mfa-management__body">
			{#if status === 'disabled'}
				Two-factor authentication is off. Your recovery codes no longer work — delete any you
				saved.
			{:else}
				Two-factor authentication is off. Turning it on means a code from your phone as well as
				your password.
			{/if}
		</p>
		<!--
			The way back on, on the branch where it belongs. Without it this is the
			dead-end species: a panel saying a thing is off, with no way to change
			that. A surface that has nowhere to send them passes nothing and gets a
			plain statement instead of a broken button.
		-->
		{#if enrol}
			<div class="mfa-management__enrol">{@render enrol()}</div>
		{/if}
	{:else}
		<p class="mfa-management__body">
			Two-factor authentication is on. Codes come from your authenticator app.
		</p>

		{#if recoveryCodes !== null}
			<RecoveryCodes
				codes={recoveryCodes}
				replaced
				headingLevel={headingLevel === 4 ? 4 : ((headingLevel + 1) as 2 | 3 | 4)}
				onAcknowledged={() => store.dispatch({ type: 'recoveryCodesAcknowledged' })}
			/>
		{/if}

		<div class="mfa-management__row">
			<button
				type="button"
				class="mfa-management__secondary"
				disabled={isBusy}
				onclick={() => store.dispatch({ type: 'regenerateRequested' })}
			>
				{isRegenerating ? 'Issuing new codes…' : 'Get new recovery codes'}
			</button>
			<button
				type="button"
				class="mfa-management__destructive"
				disabled={isBusy}
				onclick={() => store.dispatch({ type: 'disableRequested' })}
			>
				{isDisabling ? 'Turning off…' : 'Turn off'}
			</button>
		</div>

		<p class="mfa-management__note">
			New codes replace the ones you have now. Turning two-factor off removes them entirely.
		</p>
	{/if}

	<p class="mfa-management__status" role="status" aria-live="polite">
		{isDisabling ? 'Turning off two-factor authentication…' : ''}{isRegenerating
			? 'Issuing new recovery codes…'
			: ''}
	</p>

	{#if footer}
		<div class="mfa-management__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.mfa-management {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 28rem;
	}

	.mfa-management__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.mfa-management__body,
	.mfa-management__note {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.mfa-management__note {
		font-size: 0.8125rem;
	}

	.mfa-management__error {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.mfa-management__error-context {
		font-weight: 400;
	}

	.mfa-management__row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.mfa-management__secondary,
	.mfa-management__destructive {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		padding: 0 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.mfa-management__secondary {
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: transparent;
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
	}

	.mfa-management__secondary:hover:not(:disabled) {
		background: hsl(var(--muted, 210 40% 96.1%));
	}

	.mfa-management__destructive {
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: transparent;
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.4);
	}

	.mfa-management__destructive:hover:not(:disabled) {
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
	}

	.mfa-management__secondary:focus-visible,
	.mfa-management__destructive:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.mfa-management__secondary:disabled,
	.mfa-management__destructive:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.mfa-management__enrol,
	.mfa-management__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	/* Visually hidden, still announced. */
	.mfa-management__status {
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
