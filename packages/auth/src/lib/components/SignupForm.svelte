<script lang="ts">
	/**
	 * A create-account form.
	 *
	 * The same two-store shape as `LoginForm`, and for the same reason: a signup
	 * that ends in a session has to cross into the session store, and a required
	 * prop makes a forgotten wiring a compile error rather than a silent no-op.
	 *
	 * **It has two endings, and both are successes.** A backend that requires
	 * email confirmation returns no session, and this renders the terminal panel
	 * instead of handing anything over. Treating that as a failure — a red
	 * banner, a form left sitting there — is the commonest way to get signup
	 * wrong, so the two are separate states rather than one nullable field.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import PasswordCriteria from './PasswordCriteria.svelte';
	import PasswordInput from './PasswordInput.svelte';
	import type { SignupAction, SignupState } from '../flows/signup/types.js';
	import type { SignupFields } from '../flows/signup/schema.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		/** The signup flow: fields, request, structured failure. */
		flowStore: {
			readonly state: SignupState;
			dispatch(action: SignupAction): void;
			subscribe(listener: (state: SignupState) => void): () => void;
		};
		/** Where a session is handed over, when the backend issues one. */
		sessionStore: { dispatch(action: SessionAction): void };
		/** Called once, after a session has been established. */
		onSuccess?: (() => void) | undefined;
		/**
		 * Called once, when the account was created but needs its address
		 * confirmed. Receives the address the mail went to.
		 */
		onVerificationRequired?: ((email: string) => void) | undefined;
		/** Offered when the address is already registered. */
		onSignIn?: (() => void) | undefined;
		header?: Snippet | undefined;
		footer?: Snippet | undefined;
		/** Replaces the whole "check your email" panel. Receives the address. */
		verification?: Snippet<[{ email: string }]> | undefined;
		submitLabel?: string | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		emailLabel?: string | undefined;
		passwordLabel?: string | undefined;
		confirmLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		onSuccess,
		onVerificationRequired,
		onSignIn,
		header,
		footer,
		verification,
		submitLabel = 'Create account',
		headingLevel = 2,
		emailLabel = 'Email',
		passwordLabel = 'Password',
		confirmLabel = 'Confirm password',
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const emailId = `${uid}-email`;
	const emailErrorId = `${uid}-email-error`;
	const passwordId = `${uid}-password`;
	const passwordErrorId = `${uid}-password-error`;
	const criteriaId = `${uid}-criteria`;
	const confirmId = `${uid}-confirm`;
	const confirmErrorId = `${uid}-confirm-error`;

	// A stable fan-out re-pointed by an effect, so replacing `flowStore` does not
	// silently detach the fields — see `LoginForm` for the failure this avoids.
	const listeners = new Set<(state: FormState<SignupFields>) => void>();

	$effect(() => {
		return flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<SignupFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<SignupFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<SignupFields>) => void) {
			listeners.add(listener);
			listener(flowStore.state.form);
			return () => listeners.delete(listener);
		}
	};

	const error = $derived(flowStore.state.error);
	const status = $derived(flowStore.state.status);
	const isSubmitting = $derived(status === 'submitting');
	const pendingEmail = $derived(flowStore.state.pendingEmail);

	/** Whether this component has already reported the outcome it is looking at. */
	let handedOver = false;

	/**
	 * The terminal panel, focused when it replaces the form.
	 *
	 * The submit button the user just activated is removed from the document,
	 * which leaves focus on `<body>` — a keyboard user then has to tab from the
	 * top of the page to discover what happened. Moving focus to the panel is the
	 * usual answer when a view is replaced wholesale.
	 *
	 * It does mean some screen readers announce the panel twice: once as the live
	 * region, once on focus. That is the lesser of the two, and the alternative —
	 * dropping `aria-live` — leaves a user who is not moved by focus with nothing.
	 */
	let verifyPanel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'awaitingVerification') verifyPanel?.focus();
	});

	$effect(() => {
		const state = flowStore.state;

		// Cleared whenever the flow leaves a terminal state, so a form that stays
		// mounted across a second attempt reports that one too.
		if (state.status !== 'succeeded' && state.status !== 'awaitingVerification') {
			handedOver = false;
			return;
		}
		if (handedOver) return;

		if (state.status === 'succeeded' && state.session !== null) {
			handedOver = true;
			sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
			onSuccess?.();
			return;
		}

		if (state.status === 'awaitingVerification' && state.pendingEmail !== null) {
			handedOver = true;
			// Nothing is dispatched into the session store: there is no session.
			// Saying otherwise would sign in an account that cannot be used yet.
			onVerificationRequired?.(state.pendingEmail);
		}
	});
</script>

<div class="signup-form {className}">
	{#if status === 'awaitingVerification' && pendingEmail !== null}
		{#if verification}
			{@render verification({ email: pendingEmail })}
		{:else}
			<!--
				Terminal, and a success. `role="status"` rather than `alert`: the
				account was created, nothing is wrong, and the form it replaces is
				gone — so this needs announcing without the urgency of a failure.
			-->
			<div
				bind:this={verifyPanel}
				class="signup-form__verify"
				role="status"
				aria-live="polite"
				tabindex="-1"
			>
				<svelte:element this={`h${headingLevel}`} class="signup-form__title">
					Check your email
				</svelte:element>
				<p class="signup-form__verify-body">
					We sent a confirmation link to <strong>{pendingEmail}</strong>. Open it to finish setting up
					your account.
				</p>
			</div>
		{/if}
	{:else}
		{#if header}
			{@render header()}
		{:else}
			<svelte:element this={`h${headingLevel}`} class="signup-form__title">
				Create your account
			</svelte:element>
		{/if}

		{#if error}
			<div class="signup-form__error" role="alert" aria-live="polite" data-error-code={error.code}>
				<span>{error.message}</span>
				{#if error.code === 'email_taken' && onSignIn}
					<!--
						The whole point of `email_taken` being its own arm. "That address
						is taken" is not something to apologise for; it is an offer.
					-->
					<button type="button" class="signup-form__error-action" onclick={() => onSignIn()}>
						Sign in instead
					</button>
				{/if}
			</div>
		{/if}

		<Form store={formStore} class="signup-form__form">
			<FormField name="email">
				{#snippet children({ field, send })}
					<div class="signup-form__field">
						<label class="signup-form__label" for={emailId}>{emailLabel}</label>
						<input
							id={emailId}
							name="email"
							type="email"
							autocomplete="username"
							class="signup-form__input"
							class:signup-form__input--invalid={!!field.error}
							value={field.value}
							aria-invalid={field.error ? 'true' : undefined}
							aria-describedby={field.error ? emailErrorId : undefined}
							oninput={(event) =>
								send({ type: 'fieldChanged', field: 'email', value: event.currentTarget.value })}
							onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
						/>
						{#if field.error}
							<p class="signup-form__field-error" id={emailErrorId} role="alert" aria-live="polite">
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<FormField name="password">
				{#snippet children({ field, send })}
					<div class="signup-form__field">
						<label class="signup-form__label" for={passwordId}>{passwordLabel}</label>
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
							<p
								class="signup-form__field-error"
								id={passwordErrorId}
								role="alert"
								aria-live="polite"
							>
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<FormField name="confirmPassword">
				{#snippet children({ field, send })}
					<div class="signup-form__field">
						<label class="signup-form__label" for={confirmId}>{confirmLabel}</label>
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
							<p class="signup-form__field-error" id={confirmErrorId} role="alert" aria-live="polite">
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<p class="signup-form__status" role="status" aria-live="polite">
				{isSubmitting ? 'Creating your account…' : ''}
			</p>

			<button type="submit" class="signup-form__submit" disabled={isSubmitting}>
				{isSubmitting ? 'Creating account…' : submitLabel}
			</button>
		</Form>

		{#if footer}
			<div class="signup-form__footer">{@render footer()}</div>
		{/if}
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.signup-form {
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

	.signup-form__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.signup-form :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.signup-form__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.signup-form__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.signup-form__input {
		display: block;
		width: 100%;
		height: 2.5rem;
		padding: 0.5rem 0.75rem;
		font: inherit;
		font-size: 0.875rem;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--input, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
	}

	.signup-form__input:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.signup-form__input--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.signup-form__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.signup-form__error {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.signup-form__error-action {
		padding: 0;
		font: inherit;
		font-weight: 600;
		color: inherit;
		text-decoration: underline;
		background: none;
		border: none;
		cursor: pointer;
	}

	.signup-form__error-action:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.signup-form__verify:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
	}

	.signup-form__verify {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.signup-form__verify-body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	/* Visually hidden, still announced. */
	.signup-form__status {
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

	.signup-form__submit {
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

	.signup-form__submit:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.signup-form__submit:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.signup-form__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.signup-form__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
