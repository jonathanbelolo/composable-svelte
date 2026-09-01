<script lang="ts">
	/**
	 * The second-factor step.
	 *
	 * Reached from `LoginForm`'s `onMfaRequired`, which is the first thing
	 * anywhere to read `challengeId` — until this existed, the field the
	 * `AuthError` union was built to carry was validated on arrival and then only
	 * ever displayed inside a red banner offering nowhere to type a code.
	 *
	 * Two stores, like the other forms that can end in a session: satisfying the
	 * challenge *completes* the sign-in, so a `SessionSnapshot` has to cross into
	 * the session store.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import OneTimeCodeInput from './OneTimeCodeInput.svelte';
	import type { MfaChallengeAction, MfaChallengeState } from '../flows/mfa-challenge/types.js';
	import type { MfaCodeFields } from '../flows/mfa-challenge/schema.js';
	import type { MfaMethod } from '../deps.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		flowStore: {
			readonly state: MfaChallengeState;
			dispatch(action: MfaChallengeAction): void;
			subscribe(listener: (state: MfaChallengeState) => void): () => void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * The challenge, if the surface has it to hand.
		 *
		 * Optional because the store may already hold it — `LoginForm`'s
		 * `onMfaRequired` usually seeds the store directly. Passing it here
		 * dispatches rather than reads, so the reducer stays the source of truth.
		 */
		challenge?: { challengeId: string; methods: readonly MfaMethod[] } | undefined;
		/** Called once, after the session has been established. */
		onSuccess?: (() => void) | undefined;
		/**
		 * Where "start again" goes. **Required.**
		 *
		 * An expired challenge cannot be retried from here — the sign-in has to
		 * begin afresh — and a branch with nothing to click is a dead end. The same
		 * reasoning as `ResetPasswordForm`'s `onRequestNewLink`, which was optional
		 * until it silently stranded people.
		 */
		onStartOver: () => void;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		/** Rendered below the form — a link back to sign-in, say. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		challenge,
		onSuccess,
		onStartOver,
		headingLevel = 2,
		submitLabel = 'Verify',
		footer,
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const codeId = `${uid}-code`;
	const codeErrorId = `${uid}-code-error`;
	const hintId = `${uid}-hint`;

	const listeners = new Set<(state: FormState<MfaCodeFields>) => void>();

	$effect(() => {
		return flowStore.subscribe((state) => {
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<MfaCodeFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<MfaCodeFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<MfaCodeFields>) => void) {
			listeners.add(listener);
			listener(flowStore.state.form);
			return () => listeners.delete(listener);
		}
	};

	const status = $derived(flowStore.state.status);
	const error = $derived(flowStore.state.error);
	const method = $derived(flowStore.state.method);
	const methods = $derived(flowStore.state.methods);
	const challengeId = $derived(flowStore.state.challengeId);
	const isSubmitting = $derived(status === 'submitting');

	/** The challenge this component has already handed over. */
	let provided: string | null = null;

	$effect(() => {
		if (challenge === undefined || challenge.challengeId === provided) return;
		provided = challenge.challengeId;
		flowStore.dispatch({
			type: 'challengeProvided',
			challengeId: challenge.challengeId,
			methods: challenge.methods
		});
	});

	/** Whether the session has been handed over. */
	let handedOver = false;

	$effect(() => {
		const state = flowStore.state;
		if (state.status !== 'succeeded') {
			handedOver = false;
			return;
		}
		if (handedOver || state.session === null) return;
		handedOver = true;
		sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		onSuccess?.();
	});

	/**
	 * Whether the challenge is unusable — missing, or rejected as expired.
	 *
	 * Both end in the same offer, so they share a branch, and the form is
	 * withdrawn rather than left up to fail again. A wrong *code* is not in here:
	 * that is retryable, and the form must stay.
	 */
	const challengeIsDead = $derived(challengeId === null || error?.code === 'token_expired');

	const isRecovery = $derived(method === 'recovery_code');
	const canSwitch = $derived(methods.includes('totp') && methods.includes('recovery_code'));
</script>

<div class="mfa-challenge {className}">
	{#if challengeIsDead}
		<svelte:element this={`h${headingLevel}`} class="mfa-challenge__title">
			{challengeId === null ? 'Nothing to verify' : 'This sign-in attempt expired'}
		</svelte:element>
		{#if error}
			<div
				class="mfa-challenge__error"
				role="alert"
				aria-live="polite"
				data-error-code={error.code}
			>
				{error.message}
			</div>
		{:else}
			<p class="mfa-challenge__body">
				Sign in again to get a new code prompt.
			</p>
		{/if}
		<button type="button" class="mfa-challenge__action" onclick={() => onStartOver()}>
			Back to sign in
		</button>
	{:else}
		<svelte:element this={`h${headingLevel}`} class="mfa-challenge__title">
			{isRecovery ? 'Use a recovery code' : 'Enter your code'}
		</svelte:element>

		<p class="mfa-challenge__body" id={hintId}>
			{#if isRecovery}
				Enter one of the recovery codes you saved when you set up authentication. Each one works
				once.
			{:else}
				Open your authenticator app and enter the code it shows.
			{/if}
		</p>

		{#if error}
			<div
				class="mfa-challenge__error"
				role="alert"
				aria-live="polite"
				data-error-code={error.code}
			>
				{error.message}
			</div>
		{/if}

		<Form store={formStore} class="mfa-challenge__form">
			<FormField name="code">
				{#snippet children({ field, send })}
					<div class="mfa-challenge__field">
						<label class="mfa-challenge__label" for={codeId}>
							{isRecovery ? 'Recovery code' : 'Authentication code'}
						</label>
						<OneTimeCodeInput
							id={codeId}
							value={field.value}
							invalid={!!field.error}
							errorId={codeErrorId}
							describedBy={hintId}
							oneTimeCode={!isRecovery}
							placeholder={isRecovery ? undefined : '123456'}
							oninput={(event) =>
								send({ type: 'fieldChanged', field: 'code', value: event.currentTarget.value })}
						/>
						{#if field.error}
							<p class="mfa-challenge__field-error" id={codeErrorId} role="alert" aria-live="polite">
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<p class="mfa-challenge__status" role="status" aria-live="polite">
				{isSubmitting ? 'Checking your code…' : ''}
			</p>

			<button type="submit" class="mfa-challenge__submit" disabled={isSubmitting}>
				{isSubmitting ? 'Checking…' : submitLabel}
			</button>
		</Form>

		{#if canSwitch}
			<!--
				The way back in after a lost phone, which is the entire reason
				recovery codes exist. Offered only when the account actually has
				them — `methods` says so.
			-->
			<button
				type="button"
				class="mfa-challenge__link"
				onclick={() =>
					flowStore.dispatch({
						type: 'methodChosen',
						method: isRecovery ? 'totp' : 'recovery_code'
					})}
			>
				{isRecovery ? 'Use your authenticator app instead' : 'Use a recovery code instead'}
			</button>
		{/if}

		{#if footer}
			<div class="mfa-challenge__footer">{@render footer()}</div>
		{/if}
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.mfa-challenge {
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

	.mfa-challenge__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.mfa-challenge :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.mfa-challenge__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mfa-challenge__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.mfa-challenge__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.mfa-challenge__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.mfa-challenge__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.mfa-challenge__status {
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

	.mfa-challenge__submit,
	.mfa-challenge__action {
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

	.mfa-challenge__action {
		align-self: flex-start;
	}

	.mfa-challenge__submit:hover:not(:disabled),
	.mfa-challenge__action:hover {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.mfa-challenge__submit:focus-visible,
	.mfa-challenge__action:focus-visible,
	.mfa-challenge__link:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.mfa-challenge__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.mfa-challenge__link {
		align-self: flex-start;
		padding: 0;
		font: inherit;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
		text-decoration: underline;
		background: none;
		border: none;
		cursor: pointer;
	}

	.mfa-challenge__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
