<script lang="ts">
	/**
	 * Asking for a sign-in link.
	 *
	 * **No `sessionStore`**, like `ForgotPasswordForm` and for its reason: asking
	 * for a link establishes nothing. The session crosses on the other page, in
	 * `MagicLinkSignIn`.
	 *
	 * The confirmation deliberately says "if that address has an account" rather
	 * than confirming one exists. A version that answered differently for a known
	 * address would be an account checker with a friendly face, and the backend
	 * contract resolves identically either way so the surface has nothing truer
	 * to say.
	 *
	 * Pattern A: it animates nothing.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import type {
		MagicLinkRequestAction,
		MagicLinkRequestState
	} from '../flows/magic-link-request/types.js';
	import type { MagicLinkFields } from '../flows/magic-link-request/schema.js';

	interface Props {
		flowStore: {
			readonly state: MagicLinkRequestState;
			dispatch(action: MagicLinkRequestAction): void;
			subscribe(listener: (state: MagicLinkRequestState) => void): () => void;
		};
		/**
		 * Called each time the backend accepts a request, with the address given.
		 *
		 * Each time, not once: someone who mistypes, sees the confirmation, and
		 * corrects it has made two requests, and a consumer tracking "where did we
		 * send it" needs the second. `ForgotPasswordForm` had this keyed on the
		 * address and swallowed a repeat; this is keyed on the attempt.
		 */
		onSent?: ((email: string) => void) | undefined;
		/** Replaces the heading. */
		header?: Snippet | undefined;
		/** Rendered below the form on every branch — "sign in with a password". */
		footer?: Snippet | undefined;
		submitLabel?: string | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		emailLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		onSent,
		header,
		footer,
		submitLabel = 'Email me a link',
		headingLevel = 2,
		emailLabel = 'Email',
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const emailId = `${uid}-email`;
	const emailErrorId = `${uid}-email-error`;

	const listeners = new Set<(state: FormState<MagicLinkFields>) => void>();

	$effect(() => {
		return flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<MagicLinkFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<MagicLinkFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<MagicLinkFields>) => void) {
			listeners.add(listener);
			listener(flowStore.state.form);
			return () => listeners.delete(listener);
		}
	};

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const requestedFor = $derived(flowStore.state.requestedFor);
	const isSubmitting = $derived(status === 'submitting');

	/**
	 * Whether this request has been reported.
	 *
	 * Cleared whenever the flow leaves `sent`, which makes it once per *request*
	 * rather than once per distinct address. Keying on the address is the defect
	 * `ForgotPasswordForm` shipped: someone who asks twice for the same inbox got
	 * one callback, and the consumer never learned about the second.
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

<div class="magic-request {className}">
	{#if header}
		{@render header()}
	{:else}
		<svelte:element this={`h${headingLevel}`} class="magic-request__title">
			Sign in without a password
		</svelte:element>
	{/if}

	{#if error}
		<div class="magic-request__error" role="alert" aria-live="polite" data-error-code={error.code}>
			{error.message}
		</div>
	{/if}

	{#if status === 'sent' && requestedFor !== null}
		<!--
			Says "if that address has an account", not "we sent it". The backend
			resolves identically for an address with no account, so there is
			nothing truer to say — and saying more would answer a question the
			whole design refuses to answer.
		-->
		<p class="magic-request__body" role="status" aria-live="polite">
			If <strong>{requestedFor}</strong> has an account, a sign-in link is on its way. It expires
			shortly, and it works once.
		</p>
	{/if}

	<Form store={formStore} class="magic-request__form">
		<FormField name="email">
			{#snippet children({ field, send })}
				<div class="magic-request__field">
					<label class="magic-request__label" for={emailId}>{emailLabel}</label>
					<input
						id={emailId}
						name="email"
						type="email"
						autocomplete="email"
						class="magic-request__input"
						class:magic-request__input--invalid={!!field.error}
						value={field.value}
						aria-invalid={field.error ? 'true' : undefined}
						aria-describedby={field.error ? emailErrorId : undefined}
						oninput={(event) =>
							send({ type: 'fieldChanged', field: 'email', value: event.currentTarget.value })}
						onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
					/>
					{#if field.error}
						<p class="magic-request__field-error" id={emailErrorId} role="alert" aria-live="polite">
							{field.error}
						</p>
					{/if}
				</div>
			{/snippet}
		</FormField>

		<p class="magic-request__status" role="status" aria-live="polite">
			{isSubmitting ? 'Sending your link…' : ''}
		</p>

		<button type="submit" class="magic-request__submit" disabled={isSubmitting}>
			{isSubmitting ? 'Sending…' : status === 'sent' ? 'Send another link' : submitLabel}
		</button>
	</Form>

	{#if footer}
		<div class="magic-request__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.magic-request {
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

	.magic-request__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.magic-request :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.magic-request__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.magic-request__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.magic-request__input {
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

	.magic-request__input:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.magic-request__input--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.magic-request__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.magic-request__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.magic-request__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.magic-request__status {
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

	.magic-request__submit {
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

	.magic-request__submit:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.magic-request__submit:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.magic-request__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.magic-request__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
