<script lang="ts">
	/**
	 * Moving the account to a different email address.
	 *
	 * The *request* half. Confirming the link is `EmailChangeConfirmation`, on
	 * whatever page the link opens — they are separate components because they
	 * run in different page loads.
	 *
	 * **Nothing changes when this succeeds.** A link goes to the new address and
	 * the account waits; the panel says so rather than implying the move is done.
	 * That is why `pendingEmail` is shown beside `currentEmail` instead of
	 * replacing it.
	 *
	 * One store, unlike `ChangePasswordForm`: nothing here can produce a
	 * `SessionSnapshot`, so there is no session to hand over.
	 *
	 * Pattern A: it animates nothing.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { PresentationView } from '@composable-svelte/core/application';
	import type { Snippet } from 'svelte';

	import { isReauthenticationRequired } from '../errors/helpers.js';
	import type { ChangeEmailAction, ChangeEmailState } from '../flows/change-email/types.js';
	import type { ChangeEmailFields } from '../flows/change-email/schema.js';

	interface StandaloneBinding {
		mode?: 'standalone' | undefined;
		flowStore: {
			readonly state: ChangeEmailState;
			dispatch(action: ChangeEmailAction): void;
			subscribe(listener: (state: ChangeEmailState) => void): () => void;
		};
		/** The address the account answers to today, from `fetchAccount`. */
		currentEmail?: string | undefined;
		/** Whether that address is confirmed. Display-only. */
		emailVerified?: boolean | undefined;
		/**
		 * What the *account* says is pending, from `fetchAccount`.
		 *
		 * Reconciled into the flow on a change only — see the effect below. The
		 * flow keeps its own copy because a request succeeds before the next
		 * account read lands, and the panel has to say something in between.
		 */
		pendingEmail?: string | null | undefined;
		/** Called once a change has been requested, so a surface can re-read the account. */
		onChanged?: (() => void) | undefined;
		/**
		 * Called when the backend wants the user to confirm it is still them.
		 *
		 * Receives the methods the backend will accept, so the surface can prompt
		 * for the right one. Without it the demand is shown as a plain error with
		 * nothing to do about it.
		 */
		onReauthenticationRequired?:
			| ((demand: { methods: readonly ('password' | 'totp' | 'recovery_code')[] }) => void)
			| undefined;
	}

	interface ManagedBinding {
		mode: 'managed';
		flowStore: PresentationView<ChangeEmailState, ChangeEmailAction>;
		currentEmail?: string | undefined;
		emailVerified?: boolean | undefined;
		pendingEmail?: string | null | undefined;
		onChanged?: never;
		onReauthenticationRequired?: never;
	}

	interface PresentationProps {
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		emailLabel?: string | undefined;
		/** Rendered below the form on every branch. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	type Props = PresentationProps & (StandaloneBinding | ManagedBinding);

	let {
		headingLevel = 2,
		submitLabel = 'Send confirmation link',
		emailLabel = 'New email address',
		footer,
		class: className = '',
		...binding
	}: Props = $props();

	type Owner = symbol | PresentationView<ChangeEmailState, ChangeEmailAction>;
	const standaloneOwner = Symbol('standalone');
	const owner: Owner = $derived(binding.mode === 'managed' ? binding.flowStore : standaloneOwner);
	const viewOf = (key: Owner) => (typeof key === 'symbol' ? binding.flowStore : key);

	const flow: ChangeEmailState | undefined = $derived(binding.flowStore.state);

	const uid = $props.id();
	const emailId = `${uid}-email`;
	const emailErrorId = `${uid}-email-error`;

	const listeners = new Set<(state: FormState<ChangeEmailFields>) => void>();

	$effect(() => {
		if (binding.mode === 'managed') return;
		return binding.flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	function standaloneForm(): FormState<ChangeEmailFields> {
		const state = binding.flowStore.state;
		if (state === undefined) throw new Error('ChangeEmailForm: no live flow');
		return state.form;
	}

	const formStore = {
		get state(): FormState<ChangeEmailFields> {
			return standaloneForm();
		},
		dispatch(action: FormAction<ChangeEmailFields>) {
			binding.flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<ChangeEmailFields>) => void) {
			listeners.add(listener);
			listener(standaloneForm());
			return () => listeners.delete(listener);
		}
	};

	function managedFormStore(view: PresentationView<ChangeEmailState, ChangeEmailAction>) {
		let last: FormState<ChangeEmailFields> | undefined;
		function current(): FormState<ChangeEmailFields> {
			const state = view.state;
			if (state !== undefined) last = state.form;
			if (last === undefined) throw new Error('ChangeEmailForm: no live flow');
			return last;
		}
		return {
			get state() {
				return current();
			},
			dispatch(action: FormAction<ChangeEmailFields>) {
				view.dispatch({ type: 'form', action });
			},
			subscribe(listener: (state: FormState<ChangeEmailFields>) => void) {
				const unsubscribe = view.subscribe((state) => {
					if (state !== undefined) {
						last = state.form;
						listener(state.form);
					}
				});
				listener(current());
				return unsubscribe;
			}
		};
	}

	const status = $derived(flow?.status);
	const error = $derived(flow?.error ?? null);
	const resendStatus = $derived(flow?.resendStatus);
	const resendError = $derived(flow?.resendError ?? null);
	const pending = $derived(flow?.pendingEmail ?? null);
	const isSubmitting = $derived(status === 'submitting');

	/**
	 * The last value actually reported, so only a *change* is reported onward —
	 * per owner: a fresh managed owner has observed nothing yet.
	 *
	 * Not `$state`: nothing renders from it, and making it reactive would put the
	 * effect below in a loop with itself.
	 */
	let lastObserved: string | null | undefined = undefined;
	let lastObservedOwner: Owner | null = null;

	/**
	 * Tell the flow what the account says is pending, **only when it changes**.
	 *
	 * The effect re-runs whenever the store settles, and re-dispatching the
	 * unchanged prop each time would let a stale `null` — still sitting in props
	 * because the account has not been re-read yet — undo the request the moment
	 * it succeeded. That is the defect `MfaManagementPanel` records, in the same
	 * shape.
	 */
	$effect(() => {
		const key = owner;
		if (key !== lastObservedOwner) {
			lastObservedOwner = key;
			lastObserved = undefined;
		}
		if (binding.pendingEmail === undefined || binding.pendingEmail === lastObserved) return;
		const view = viewOf(key);
		if (view.state === undefined) return;
		lastObserved = binding.pendingEmail;
		if (binding.pendingEmail !== null) {
			reported = binding.pendingEmail;
		}
		view.dispatch({ type: 'pendingEmailObserved', email: binding.pendingEmail });
	});

	/** Whether the request has been reported. Cleared when nothing is pending. */
	// svelte-ignore state_referenced_locally
	let reported: string | null = binding.pendingEmail ?? binding.flowStore.state?.pendingEmail ?? null;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const current = binding.flowStore.state?.pendingEmail ?? null;
		if (current === null) {
			reported = null;
			return;
		}
		if (reported === current) return;
		reported = current;
		binding.onChanged?.();
	});

	/**
	 * Whether the re-authentication demand has been reported.
	 *
	 * Cleared whenever the flow is not sitting on one, so it is once per demand
	 * rather than once per distinct anything.
	 */
	let reportedDemand = false;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const current = binding.flowStore.state?.error ?? null;
		if (binding.onReauthenticationRequired === undefined || !isReauthenticationRequired(current)) {
			reportedDemand = false;
			return;
		}
		if (reportedDemand) return;
		reportedDemand = true;
		binding.onReauthenticationRequired({ methods: current.methods });
	});

	/**
	 * An address that already has an account is not a failure to apologise for.
	 *
	 * It is a fact the user can act on — sign in to that account, or pick
	 * another address — so it is rendered as an offer rather than a red banner.
	 * `email_taken` names the address here because the caller is already
	 * authenticated as themselves; the only thing disclosed is disclosed to its
	 * owner.
	 */
	const taken = $derived(error !== null && error.code === 'email_taken' ? error : null);

	/**
	 * Whether the error should be shown as a failure.
	 *
	 * A demand a consumer is handling is not one — they are routing to a prompt,
	 * and a red "something went wrong" on the way there is both wrong and
	 * alarming. Nor is `email_taken`, which has its own branch above.
	 */
	const showsError = $derived(
		error !== null &&
			taken === null &&
			!(binding.mode !== 'managed' && binding.onReauthenticationRequired !== undefined && isReauthenticationRequired(error))
	);
</script>

{#if flow}
	{#each [owner] as key (key)}
		<div class="change-email {className}">
			<svelte:element this={`h${headingLevel}`} class="change-email__title">
				Change your email address
			</svelte:element>

			{#if binding.currentEmail !== undefined}
				<p class="change-email__body">
					You are <strong>{binding.currentEmail}</strong>{binding.emailVerified === false
						? ' — not yet confirmed'
						: ''}.
				</p>
			{/if}

			{#if pending !== null}
				<div class="change-email__pending" role="status" aria-live="polite">
					<p class="change-email__pending-body">
						We have sent a link to <strong>{pending}</strong>. Nothing changes until you follow it.
					</p>
					<button
						type="button"
						class="change-email__secondary"
						disabled={resendStatus === 'sending'}
						onclick={() => viewOf(key).dispatch({ type: 'resendRequested' })}
					>
						{resendStatus === 'sending' ? 'Sending…' : 'Send it again'}
					</button>
					{#if resendStatus === 'sent'}
						<p class="change-email__note">Sent again.</p>
					{/if}
					{#if resendError !== null}
						<p class="change-email__error" role="alert">{resendError.message}</p>
					{/if}
				</div>
			{/if}

			{#if taken !== null}
				<div class="change-email__taken" role="status" aria-live="polite">
					<p class="change-email__pending-body">
						{taken.message}
					</p>
					{#if taken.code === 'email_taken' && taken.email !== undefined}
						<p class="change-email__note">
							If <strong>{taken.email}</strong> is yours, sign in to it instead — an address can only
							belong to one account.
						</p>
					{/if}
				</div>
			{/if}

			{#if showsError && error !== null}
				<p class="change-email__error" role="alert">{error.message}</p>
			{/if}

			<Form store={typeof key === 'symbol' ? formStore : managedFormStore(key)} class="change-email__form">
				<FormField name="email">
					{#snippet children({ field, send })}
						<div class="change-email__field">
							<label class="change-email__label" for={emailId}>{emailLabel}</label>
							<input
								id={emailId}
								name="email"
								type="email"
								autocomplete="email"
								class="change-email__input"
								class:change-email__input--invalid={!!field.error}
								value={field.value}
								aria-invalid={field.error ? 'true' : undefined}
								aria-describedby={field.error ? emailErrorId : undefined}
								oninput={(event) =>
									send({ type: 'fieldChanged', field: 'email', value: event.currentTarget.value })}
								onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
							/>
							{#if field.error}
								<p class="change-email__field-error" id={emailErrorId} role="alert" aria-live="polite">
									{field.error}
								</p>
							{/if}
						</div>
					{/snippet}
				</FormField>

				<button type="submit" class="change-email__submit" disabled={isSubmitting}>
					{isSubmitting ? 'Sending…' : submitLabel}
				</button>
			</Form>

			{#if footer}
				<div class="change-email__footer">{@render footer()}</div>
			{/if}
		</div>
	{/each}
{/if}

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.change-email {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 28rem;
	}

	.change-email__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.change-email__body,
	.change-email__note,
	.change-email__pending-body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.change-email__note {
		font-size: 0.8125rem;
	}

	.change-email__pending,
	.change-email__taken {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
		padding: 0.75rem;
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
		background: hsl(var(--muted, 210 40% 96.1%));
	}

	.change-email__error {
		margin: 0;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.change-email__form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.change-email__field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.change-email__label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
	}

	.change-email__input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--input, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
	}

	.change-email__input:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.change-email__input--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.change-email__field-error {
		margin: 0;
		font-size: 0.8125rem;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.change-email__submit,
	.change-email__secondary {
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.change-email__submit {
		color: hsl(var(--primary-foreground, 210 40% 98%));
		background: hsl(var(--primary, 222.2 47.4% 11.2%));
		border: 1px solid transparent;
	}

	.change-email__secondary {
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
	}

	.change-email__submit:disabled,
	.change-email__secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.change-email__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
