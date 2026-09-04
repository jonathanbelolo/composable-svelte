<script lang="ts">
	/**
	 * "Send me a reset link."
	 *
	 * Takes **one** store, unlike the other forms here. There is no session to
	 * hand over — asking for a link establishes nothing — so a `sessionStore`
	 * prop would be a lie about what this does.
	 *
	 * **Success does not replace the form.** Signup's terminal panel is honest
	 * because the account now exists; this one cannot make an equivalent claim.
	 * The backend will not say whether the address has an account, so the
	 * message is conditional — "if there is an account for…" — and a user who
	 * mistyped needs the form still in front of them to try another address.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import type {
		ForgotPasswordAction,
		ForgotPasswordState
	} from '../flows/forgot-password/types.js';
	import type { ForgotPasswordFields } from '../flows/forgot-password/schema.js';

	interface Props {
		flowStore: {
			readonly state: ForgotPasswordState;
			dispatch(action: ForgotPasswordAction): void;
			subscribe(listener: (state: ForgotPasswordState) => void): () => void;
		};
		/** Called each time the backend accepts a request, with the address given. */
		onSent?: ((email: string) => void) | undefined;
		/** Offered beside the form — "back to sign in". */
		footer?: Snippet | undefined;
		header?: Snippet | undefined;
		submitLabel?: string | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		emailLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		onSent,
		footer,
		header,
		submitLabel = 'Send reset link',
		headingLevel = 2,
		emailLabel = 'Email',
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const emailId = `${uid}-email`;
	const emailErrorId = `${uid}-email-error`;

	// A stable fan-out re-pointed by an effect, so replacing `flowStore` does not
	// silently detach the field — see `LoginForm` for the failure this avoids.
	const listeners = new Set<(state: FormState<ForgotPasswordFields>) => void>();

	$effect(() => {
		return flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<ForgotPasswordFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<ForgotPasswordFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<ForgotPasswordFields>) => void) {
			listeners.add(listener);
			listener(flowStore.state.form);
			return () => listeners.delete(listener);
		}
	};

	const error = $derived(flowStore.state.error);
	const status = $derived(flowStore.state.status);
	const isSubmitting = $derived(status === 'submitting');
	const requestedFor = $derived(flowStore.state.requestedFor);

	/**
	 * Whether this acceptance has been reported.
	 *
	 * Cleared whenever the flow leaves `sent`, which is what makes it "once per
	 * acceptance" rather than "once per distinct address". Comparing addresses
	 * instead — the obvious first attempt — silently swallowed the commonest
	 * repeat there is: the mail did not arrive, so the user pressed send again
	 * with the same address, the backend accepted it again, and the consumer was
	 * never told.
	 *
	 * A plain `let`, per the animation-guard convention, and the same shape as
	 * `handedOver` in the other forms here.
	 */
	let reported = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'sent') {
			reported = false;
			return;
		}
		if (reported || state.requestedFor === null) return;
		reported = true;
		onSent?.(state.requestedFor);
	});
</script>

<div class="forgot-form {className}">
	{#if header}
		{@render header()}
	{:else}
		<svelte:element this={`h${headingLevel}`} class="forgot-form__title">
			Reset your password
		</svelte:element>
	{/if}

	{#if error}
		<div class="forgot-form__error" role="alert" aria-live="polite" data-error-code={error.code}>
			{error.message}
		</div>
	{/if}

	{#if status === 'sent' && requestedFor !== null}
		<!--
			Deliberately conditional. The backend does not say whether the address
			has an account and neither may this: "we sent you a link" would be a
			claim nothing here can support, and one that turns the form into an
			account checker for anyone paying attention.
		-->
		<div class="forgot-form__sent" role="status" aria-live="polite">
			If there is an account for <strong>{requestedFor}</strong>, a reset link is on its way. Check
			your spam folder if it does not arrive.
		</div>
	{/if}

	<Form store={formStore} class="forgot-form__form">
		<FormField name="email">
			{#snippet children({ field, send })}
				<div class="forgot-form__field">
					<label class="forgot-form__label" for={emailId}>{emailLabel}</label>
					<input
						id={emailId}
						name="email"
						type="email"
						autocomplete="username"
						class="forgot-form__input"
						class:forgot-form__input--invalid={!!field.error}
						value={field.value}
						aria-invalid={field.error ? 'true' : undefined}
						aria-describedby={field.error ? emailErrorId : undefined}
						oninput={(event) =>
							send({ type: 'fieldChanged', field: 'email', value: event.currentTarget.value })}
						onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
					/>
					{#if field.error}
						<p class="forgot-form__field-error" id={emailErrorId} role="alert" aria-live="polite">
							{field.error}
						</p>
					{/if}
				</div>
			{/snippet}
		</FormField>

		<p class="forgot-form__status" role="status" aria-live="polite">
			{isSubmitting ? 'Sending…' : ''}
		</p>

		<button type="submit" class="forgot-form__submit" disabled={isSubmitting}>
			{isSubmitting ? 'Sending…' : submitLabel}
		</button>
	</Form>

	{#if footer}
		<div class="forgot-form__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.forgot-form {
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

	.forgot-form__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.forgot-form :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.forgot-form__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.forgot-form__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.forgot-form__input {
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

	.forgot-form__input:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.forgot-form__input--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.forgot-form__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.forgot-form__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.forgot-form__sent {
		padding: 0.75rem;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
		background: hsl(var(--muted, 210 40% 96.1%));
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.forgot-form__status {
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

	.forgot-form__submit {
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

	.forgot-form__submit:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.forgot-form__submit:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.forgot-form__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.forgot-form__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
