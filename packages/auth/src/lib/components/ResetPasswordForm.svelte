<script lang="ts">
	/**
	 * Setting a new password from a reset link.
	 *
	 * The hybrid: a token from a URL, like `EmailVerification`, and a password
	 * with a confirm field, like `SignupForm`. It takes both stores because a
	 * reset can end in a session.
	 *
	 * **It does not copy `EmailVerification`'s mount effect**, and that is the
	 * thing most likely to be added back by mistake. There, the token is
	 * exchanged as soon as the page loads, so an effect that re-fires spends a
	 * single-use link — hence two guards. Here the exchange happens on submit,
	 * because the user has to type something first. There is no mount effect, so
	 * there is nothing to guard: the fixed cancellation id in the reducer is the
	 * whole of it.
	 *
	 * A missing token is still a state worth rendering rather than an error to
	 * report — someone reached the page directly, or a mail client mangled the
	 * link — but unlike verification there is no resend to offer from here, so it
	 * points back at the request page.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import PasswordCriteria from './PasswordCriteria.svelte';
	import PasswordInput from './PasswordInput.svelte';
	import type { ResetPasswordAction, ResetPasswordState } from '../flows/reset-password/types.js';
	import type { ResetPasswordFields } from '../flows/reset-password/schema.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: ResetPasswordState;
			dispatch(action: ResetPasswordAction): void;
			subscribe(listener: (state: ResetPasswordState) => void): () => void;
		};
		/** Where a session is handed over, when the reset issued one. */
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * The token from the link.
		 *
		 * Optional: the store may already hold one. When both are present this
		 * wins, and it is dispatched rather than read directly so the reducer
		 * stays the single source of truth.
		 */
		token?: string | null | undefined;
		/** Called once, after a session has been established. */
		onSuccess?: (() => void) | undefined;
		/** Offered once the password is changed but no session was issued. */
		onSignIn?: (() => void) | undefined;
		/**
		 * Where "send me a new link" goes. **Required.**
		 *
		 * Not optional, for the same reason `sessionStore` is not: a reset page
		 * whose dead-link branch has no way out is broken by construction, and
		 * omitting the prop failed *silently* — the panel told the user to ask for
		 * a new link and rendered no control to do it with. Only the consumer
		 * knows that route, so the compiler is the right place to insist on it.
		 */
		onRequestNewLink: () => void;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		passwordLabel?: string | undefined;
		confirmLabel?: string | undefined;
		/** Replaces the confirmed panel. Receives whether a session was issued. */
		done?: Snippet<[{ signedIn: boolean }]> | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		token = null,
		onSuccess,
		onSignIn,
		onRequestNewLink,
		headingLevel = 2,
		submitLabel = 'Set new password',
		passwordLabel = 'New password',
		confirmLabel = 'Confirm new password',
		done,
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const passwordId = `${uid}-password`;
	const passwordErrorId = `${uid}-password-error`;
	const criteriaId = `${uid}-criteria`;
	const confirmId = `${uid}-confirm`;
	const confirmErrorId = `${uid}-confirm-error`;

	const listeners = new Set<(state: FormState<ResetPasswordFields>) => void>();

	$effect(() => {
		return flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<ResetPasswordFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<ResetPasswordFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<ResetPasswordFields>) => void) {
			listeners.add(listener);
			listener(flowStore.state.form);
			return () => listeners.delete(listener);
		}
	};

	const error = $derived(flowStore.state.error);
	const status = $derived(flowStore.state.status);
	const session = $derived(flowStore.state.session);
	const isSubmitting = $derived(status === 'submitting');
	/** The store's token, which the prop feeds rather than replaces. */
	const heldToken = $derived(flowStore.state.token);

	/**
	 * The token this component has already handed to the flow.
	 *
	 * Nothing like verification's guard — that one stops a single-use token
	 * being *spent* twice. This only stops a redundant dispatch, and exists
	 * because the effect re-runs whenever the prop changes.
	 */
	let provided: string | null = null;

	$effect(() => {
		if (token === null || token === provided) return;
		provided = token;
		flowStore.dispatch({ type: 'tokenProvided', token });
	});

	/** Whether the session produced by the reset has been handed over. */
	let handedOver = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'reset') {
			handedOver = false;
			return;
		}
		if (handedOver || state.session === null) return;
		handedOver = true;
		sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		onSuccess?.();
	});

	/** The done panel, focused when it replaces the form. */
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'reset') panel?.focus();
	});

	/**
	 * Whether the link is unusable — missing, or rejected as stale.
	 *
	 * Both end in the same offer, so they share a branch. `token_expired` is the
	 * one failure this form cannot fix by resubmitting, which is why it is
	 * separated from the ordinary error banner rather than sitting above a form
	 * that will fail again.
	 */
	const linkIsDead = $derived(heldToken === null || error?.code === 'token_expired');
</script>

<div class="reset-form {className}">
	{#if status === 'reset'}
		{#if done}
			{@render done({ signedIn: session !== null })}
		{:else}
			<div
				bind:this={panel}
				class="reset-form__panel"
				role="status"
				aria-live="polite"
				tabindex="-1"
			>
				<svelte:element this={`h${headingLevel}`} class="reset-form__title">
					Password changed
				</svelte:element>
				<p class="reset-form__body">
					{#if session !== null}
						You are signed in with your new password.
					{:else}
						Sign in with your new password to continue.
					{/if}
				</p>
				{#if session === null && onSignIn}
					<button type="button" class="reset-form__action" onclick={() => onSignIn()}>
						Sign in
					</button>
				{/if}
			</div>
		{/if}
	{:else if linkIsDead}
		<!--
			A dead or missing link, and the form is not shown: resubmitting it
			cannot help, and leaving it there invites the user to try.
		-->
		<svelte:element this={`h${headingLevel}`} class="reset-form__title">
			{heldToken === null ? 'This link is incomplete' : 'This link has expired'}
		</svelte:element>
		{#if error}
			<div class="reset-form__error" role="alert" aria-live="polite" data-error-code={error.code}>
				{error.message}
			</div>
		{:else}
			<p class="reset-form__body">
				Reset links are single-use and time-limited. Ask for a new one to continue.
			</p>
		{/if}
		<button type="button" class="reset-form__action" onclick={() => onRequestNewLink()}>
			Send me a new link
		</button>
	{:else}
		<svelte:element this={`h${headingLevel}`} class="reset-form__title">
			Choose a new password
		</svelte:element>

		{#if error}
			<div class="reset-form__error" role="alert" aria-live="polite" data-error-code={error.code}>
				{error.message}
			</div>
		{/if}

		<Form store={formStore} class="reset-form__form">
			<FormField name="password">
				{#snippet children({ field, send })}
					<div class="reset-form__field">
						<label class="reset-form__label" for={passwordId}>{passwordLabel}</label>
						<PasswordInput
							id={passwordId}
							name="password"
							value={field.value}
							invalid={!!field.error}
							errorId={passwordErrorId}
							describedBy={criteriaId}
							autocomplete="new-password"
							oninput={(event) =>
								send({ type: 'fieldChanged', field: 'password', value: event.currentTarget.value })}
							onblur={() => send({ type: 'fieldBlurred', field: 'password' })}
						/>
						<PasswordCriteria id={criteriaId} password={String(field.value ?? '')} />
						{#if field.error}
							<p class="reset-form__field-error" id={passwordErrorId} role="alert" aria-live="polite">
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<FormField name="confirmPassword">
				{#snippet children({ field, send })}
					<div class="reset-form__field">
						<label class="reset-form__label" for={confirmId}>{confirmLabel}</label>
						<PasswordInput
							id={confirmId}
							name="confirmPassword"
							value={field.value}
							invalid={!!field.error}
							errorId={confirmErrorId}
							autocomplete="new-password"
							oninput={(event) =>
								send({
									type: 'fieldChanged',
									field: 'confirmPassword',
									value: event.currentTarget.value
								})}
							onblur={() => send({ type: 'fieldBlurred', field: 'confirmPassword' })}
						/>
						{#if field.error}
							<p class="reset-form__field-error" id={confirmErrorId} role="alert" aria-live="polite">
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<p class="reset-form__status" role="status" aria-live="polite">
				{isSubmitting ? 'Setting your new password…' : ''}
			</p>

			<button type="submit" class="reset-form__submit" disabled={isSubmitting}>
				{isSubmitting ? 'Setting…' : submitLabel}
			</button>
		</Form>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.reset-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: 100%;
		max-width: 24rem;
		padding: 2rem;
		color: hsl(var(--card-foreground, 222.2 84% 4.9%));
		background: hsl(var(--card, 0 0% 100%));
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
		border-radius: 0.5rem;
	}

	.reset-form__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.reset-form :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.reset-form__panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.reset-form__panel:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
	}

	.reset-form__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.reset-form__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.reset-form__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.reset-form__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.reset-form__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.reset-form__status {
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

	.reset-form__action,
	.reset-form__submit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		align-self: flex-start;
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

	.reset-form__submit {
		align-self: stretch;
	}

	.reset-form__action:hover:not(:disabled),
	.reset-form__submit:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.reset-form__action:focus-visible,
	.reset-form__submit:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.reset-form__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
