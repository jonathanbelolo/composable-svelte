<script lang="ts">
	/**
	 * Setting or changing the password on the signed-in account.
	 *
	 * **No current-password field, and that is the design rather than an
	 * omission.** The client cannot know whether the account has a password:
	 * `SessionSnapshot` carries no credential-kind field, and an account created
	 * through OAuth or a magic link never set one. So a backend that wants proof
	 * says so — `reauthentication_required`, carrying which methods it accepts —
	 * and this reports it rather than guessing.
	 *
	 * Two stores, like every component that can end in a session: many backends
	 * rotate the session on a password change to invalidate other devices, and a
	 * `SessionSnapshot` then has to cross into the session store.
	 *
	 * Pattern A: it animates nothing.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import PasswordInput from './PasswordInput.svelte';
	import PasswordCriteria from './PasswordCriteria.svelte';
	import { isReauthenticationRequired } from '../errors/helpers.js';
	import type {
		ChangePasswordAction,
		ChangePasswordState
	} from '../flows/change-password/types.js';
	import type { ChangePasswordFields } from '../flows/change-password/schema.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: ChangePasswordState;
			dispatch(action: ChangePasswordAction): void;
			subscribe(listener: (state: ChangePasswordState) => void): () => void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * Whether the account already has a password.
		 *
		 * From `fetchAccount`, and display-only: it decides whether this says
		 * "change" or "set". Offering to *change* a password an OAuth-only account
		 * never had is a small lie that makes the whole panel untrustworthy.
		 *
		 * `undefined` means not known yet, and the panel then says "change" —
		 * the commoner case, and the one that is wrong only for an account that
		 * has no password. **It will flip to "set" when the account arrives**, so
		 * a surface that would rather not show that flicker should render the
		 * panel once the account has loaded, as the styleguide demo does.
		 */
		hasPassword?: boolean | undefined;
		/** Called once the password has been changed. */
		onChanged?: (() => void) | undefined;
		/**
		 * Called when the backend wants the user to confirm it is still them.
		 *
		 * A real branch, not a hypothetical: this is the whole re-authentication
		 * design. Receives the methods the backend will accept, so the surface can
		 * prompt for the right one. Without it the user is shown the demand as a
		 * plain error with nothing to do about it — which is the dead end this
		 * package has now fixed three times elsewhere.
		 */
		onReauthenticationRequired?:
			| ((demand: { methods: readonly ('password' | 'totp' | 'recovery_code')[] }) => void)
			| undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		/** Rendered below the form on every branch. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		hasPassword,
		onChanged,
		onReauthenticationRequired,
		headingLevel = 2,
		submitLabel,
		footer,
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const passwordId = `${uid}-password`;
	const passwordErrorId = `${uid}-password-error`;
	const confirmId = `${uid}-confirm`;
	const confirmErrorId = `${uid}-confirm-error`;
	const criteriaId = `${uid}-criteria`;

	const listeners = new Set<(state: FormState<ChangePasswordFields>) => void>();

	$effect(() => {
		return flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<ChangePasswordFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<ChangePasswordFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<ChangePasswordFields>) => void) {
			listeners.add(listener);
			listener(flowStore.state.form);
			return () => listeners.delete(listener);
		}
	};

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const isSubmitting = $derived(status === 'submitting');

	/** Neutral while the account is still loading, rather than guessing. */
	const verb = $derived(hasPassword === false ? 'Set' : 'Change');
	const title = $derived(hasPassword === false ? 'Set a password' : 'Change your password');

	/** Whether the session produced by the change has been handed over. */
	let handedOver = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'changed') {
			handedOver = false;
			return;
		}
		if (handedOver) return;
		handedOver = true;
		// A rotated session crosses over; `null` means this device kept its own,
		// which is a success too — so `onChanged` fires either way.
		if (state.session !== null) {
			sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		}
		onChanged?.();
	});

	/**
	 * Whether the re-authentication demand has been reported.
	 *
	 * Cleared whenever the flow is not sitting on one, so it is once per demand
	 * rather than once per distinct anything — the species fixed in `LoginForm`,
	 * where keying on an id meant a repeated identical demand was swallowed.
	 */
	let reportedDemand = false;

	$effect(() => {
		const current = flowStore.state.error;
		if (onReauthenticationRequired === undefined || !isReauthenticationRequired(current)) {
			reportedDemand = false;
			return;
		}
		if (reportedDemand) return;
		reportedDemand = true;
		onReauthenticationRequired({ methods: current.methods });
	});

	/**
	 * Whether the error should be shown as a failure.
	 *
	 * A re-authentication demand handled by a consumer is not one: they are
	 * routing to a confirmation prompt, and a red "something went wrong" on the
	 * way there is both wrong and alarming. The `mfa_required` lesson.
	 */
	const showsError = $derived(
		error !== null &&
			!(onReauthenticationRequired !== undefined && isReauthenticationRequired(error))
	);
</script>

<div class="change-password {className}">
	<svelte:element this={`h${headingLevel}`} class="change-password__title">
		{title}
	</svelte:element>

	{#if hasPassword === false}
		<p class="change-password__body">
			This account signs in another way today. Setting a password adds one — it does not remove
			anything.
		</p>
	{/if}

	{#if status === 'changed'}
		<p class="change-password__body" role="status" aria-live="polite">
			Your password is set. Other devices may need to sign in again.
		</p>
	{/if}

	{#if showsError && error}
		<div
			class="change-password__error"
			role="alert"
			aria-live="polite"
			data-error-code={error.code}
		>
			{error.message}
		</div>
	{/if}

	<Form store={formStore} class="change-password__form">
		<FormField name="password">
			{#snippet children({ field, send })}
				<div class="change-password__field">
					<label class="change-password__label" for={passwordId}>New password</label>
					<PasswordInput
						id={passwordId}
						name="password"
						value={field.value}
						autocomplete="new-password"
						invalid={!!field.error}
						errorId={passwordErrorId}
						describedBy={criteriaId}
						oninput={(event) =>
							send({ type: 'fieldChanged', field: 'password', value: event.currentTarget.value })}
						onblur={() => send({ type: 'fieldBlurred', field: 'password' })}
					/>
					{#if field.error}
						<p
							class="change-password__field-error"
							id={passwordErrorId}
							role="alert"
							aria-live="polite"
						>
							{field.error}
						</p>
					{/if}
					<div id={criteriaId}>
						<PasswordCriteria password={field.value} />
					</div>
				</div>
			{/snippet}
		</FormField>

		<FormField name="confirmPassword">
			{#snippet children({ field, send })}
				<div class="change-password__field">
					<label class="change-password__label" for={confirmId}>Confirm new password</label>
					<PasswordInput
						id={confirmId}
						name="confirmPassword"
						value={field.value}
						autocomplete="new-password"
						invalid={!!field.error}
						errorId={confirmErrorId}
						oninput={(event) =>
							send({
								type: 'fieldChanged',
								field: 'confirmPassword',
								value: event.currentTarget.value
							})}
						onblur={() => send({ type: 'fieldBlurred', field: 'confirmPassword' })}
					/>
					{#if field.error}
						<p
							class="change-password__field-error"
							id={confirmErrorId}
							role="alert"
							aria-live="polite"
						>
							{field.error}
						</p>
					{/if}
				</div>
			{/snippet}
		</FormField>

		<p class="change-password__status" role="status" aria-live="polite">
			{isSubmitting ? 'Saving your password…' : ''}
		</p>

		<button type="submit" class="change-password__submit" disabled={isSubmitting}>
			{isSubmitting ? 'Saving…' : (submitLabel ?? `${verb} password`)}
		</button>
	</Form>

	{#if footer}
		<div class="change-password__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.change-password {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 24rem;
	}

	.change-password__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.change-password :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.change-password__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.change-password__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.change-password__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.change-password__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.change-password__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.change-password__status {
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

	.change-password__submit {
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

	.change-password__submit:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.change-password__submit:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.change-password__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.change-password__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
