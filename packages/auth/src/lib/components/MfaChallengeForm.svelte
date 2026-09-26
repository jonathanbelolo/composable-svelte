<script lang="ts">
	/**
	 * The second-factor step.
	 *
	 * Reached from `LoginForm`'s `onMfaRequired`, which is the first thing
	 * anywhere to read `challengeId` — until this existed, the field the
	 * `AuthError` union was built to carry was validated on arrival and then only
	 * ever displayed inside a red banner offering nowhere to type a code.
	 *
	 * In standalone mode, two stores, like the other forms that can end in a session: satisfying the
	 * challenge *completes* the sign-in, so a `SessionSnapshot` has to cross into
	 * the session store.
	 *
	 * `mode="managed"` takes `createAuthFeature`'s MFA view instead, and only
	 * that: the feature hands the session over and routes "start over" itself,
	 * so this form dispatches `startOverRequested` rather than calling out. As in
	 * `LoginForm`, a retired view renders nothing and the `Form` subtree is keyed
	 * by the view.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { PresentationView } from '@composable-svelte/core/application';
	import type { Snippet } from 'svelte';

	import OneTimeCodeInput from './OneTimeCodeInput.svelte';
	import type { MfaChallengeAction, MfaChallengeState } from '../flows/mfa-challenge/types.js';
	import type { MfaCodeFields } from '../flows/mfa-challenge/schema.js';
	import type { MfaMethod } from '../deps.js';
	import type { SessionAction } from '../session/types.js';

	/** A store the form holds for its whole life; its state is always there. */
	interface StandaloneMfaChallengeStore {
		readonly state: MfaChallengeState;
		dispatch(action: MfaChallengeAction): void;
		subscribe(listener: (state: MfaChallengeState) => void): () => void;
	}

	/** The form performs the handoff and routes "start over" through the caller. */
	interface StandaloneBinding {
		mode?: 'standalone' | undefined;
		flowStore: StandaloneMfaChallengeStore;
		sessionStore: { dispatch(action: SessionAction): void };
		/**
		 * The challenge, if the surface has it to hand.
		 *
		 * Optional because the store may already hold it — `LoginForm`'s
		 * `onMfaRequired` usually seeds the store directly. Passing it here
		 * dispatches rather than reads, so the reducer stays the source of truth.
		 */
		challenge?: { challengeId: string; methods: readonly MfaMethod[] } | undefined;
		/** Called once per logical form lifetime, after the session has been established. */
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
	}

	/**
	 * `createAuthFeature` seeds the challenge from `mfa_required`, hands the
	 * session over, and answers `startOverRequested` with a fresh sign-in. The
	 * form gets none of those powers.
	 */
	interface ManagedBinding {
		mode: 'managed';
		/** The feature's MFA view. Its `state` is `undefined` once the owner retires. */
		flowStore: PresentationView<MfaChallengeState, MfaChallengeAction>;
		sessionStore?: never;
		challenge?: never;
		onSuccess?: never;
		onStartOver?: never;
	}

	interface PresentationProps {
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		/** Rendered below the form, on every branch — a link back to sign-in, say. */
		footer?: Snippet | undefined;
		class?: string | undefined;
	}

	type Props = PresentationProps & (StandaloneBinding | ManagedBinding);

	// `binding` keeps `mode` with the store and callbacks it decides, so
	// narrowing on `binding.mode` narrows them too.
	let {
		headingLevel = 2,
		submitLabel = 'Verify',
		footer,
		class: className = '',
		...binding
	}: Props = $props();

	const uid = $props.id();
	const codeId = `${uid}-code`;
	const codeErrorId = `${uid}-code-error`;
	const hintId = `${uid}-hint`;

	const listeners = new Set<(state: FormState<MfaCodeFields>) => void>();

	/** `undefined` only for a managed view whose owner has retired. See `LoginForm`. */
	const flow: MfaChallengeState | undefined = $derived(binding.flowStore.state);
	const live = $derived(flow !== undefined);

	/** The last form slice seen, for a retiring subtree still being torn down. */
	let lastForm: FormState<MfaCodeFields> | undefined;

	function currentForm(): FormState<MfaCodeFields> {
		const state = binding.flowStore.state;
		if (state !== undefined) lastForm = state.form;
		// Unreachable: the form first subscribes while rendering under `{#if flow}`.
		if (lastForm === undefined) throw new Error('MfaChallengeForm: the form rendered without a flow');
		return lastForm;
	}

	$effect(() => {
		const store = binding.flowStore;
		if (!live) return;
		return store.subscribe((state: MfaChallengeState | undefined) => {
			if (state === undefined) return;
			lastForm = state.form;
			for (const listener of listeners) listener(state.form);
		});
	});

	const formStore = {
		get state(): FormState<MfaCodeFields> {
			return currentForm();
		},
		dispatch(action: FormAction<MfaCodeFields>) {
			binding.flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<MfaCodeFields>) => void) {
			listeners.add(listener);
			listener(currentForm());
			return () => listeners.delete(listener);
		}
	};

	/** A keyed managed subtree keeps its dispatch and subscription on its own view. */
	function managedFormStore(view: PresentationView<MfaChallengeState, MfaChallengeAction>) {
		let last: FormState<MfaCodeFields> | undefined;
		function current(): FormState<MfaCodeFields> {
			const state = view.state;
			if (state !== undefined) last = state.form;
			if (last === undefined) throw new Error('MfaChallengeForm: the form rendered without a flow');
			return last;
		}
		return {
			get state() { return current(); },
			dispatch(action: FormAction<MfaCodeFields>) { view.dispatch({ type: 'form', action }); },
			subscribe(listener: (state: FormState<MfaCodeFields>) => void) {
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

	/** Managed: one `Form` subtree per captured view. See `LoginForm`. */
	const formOwner = $derived(binding.mode === 'managed' ? binding.flowStore : null);
	const activeFormStore = $derived(
		binding.mode === 'managed' ? managedFormStore(binding.flowStore) : formStore
	);

	const status = $derived(flow?.status ?? 'idle');
	const error = $derived(flow?.error ?? null);
	const method = $derived(flow?.method ?? 'totp');
	const methods = $derived(flow?.methods ?? []);
	const challengeId = $derived(flow?.challengeId ?? null);
	const isSubmitting = $derived(status === 'submitting');

	/** The challenge this component has already handed over. Standalone only. */
	// svelte-ignore state_referenced_locally
	let provided: string | null = flow?.challengeId ?? null;

	$effect(() => {
		if (binding.mode === 'managed') return;
		const { challenge } = binding;
		if (challenge === undefined || challenge.challengeId === provided) return;
		provided = challenge.challengeId;
		binding.flowStore.dispatch({
			type: 'challengeProvided',
			challengeId: challenge.challengeId,
			methods: challenge.methods
		});
	});

	let successHeading = $state<HTMLElement | null>(null);

	/** Form generation that has already handed over its session. */
	let handedOverGeneration: number | null = null;

	// Standalone only. Managed, the feature hands the session over and retires
	// this flow in the same reduction, so there is no success screen to focus.
	$effect(() => {
		if (binding.mode === 'managed') return;
		const state = binding.flowStore.state;
		if (state.status !== 'succeeded') return;
		const generation = state.formGeneration ?? 0;
		if (handedOverGeneration === generation || state.session === null) return;
		handedOverGeneration = generation;
		if (successHeading && typeof successHeading.focus === 'function') {
			successHeading.focus();
		}
		binding.sessionStore.dispatch({ type: 'sessionEstablished', session: state.session });
		binding.onSuccess?.();
	});

	/** Back to sign in: the caller's route standalone, the feature's input managed. */
	function startOver(): void {
		if (binding.mode === 'managed') binding.flowStore.dispatch({ type: 'startOverRequested' });
		else binding.onStartOver();
	}

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

{#if flow}
	<div class="mfa-challenge {className}">
		<p class="mfa-challenge__status" role="status" aria-live="polite">
			{status === 'succeeded' ? 'Verification complete.' : isSubmitting ? 'Checking your code…' : ''}
		</p>
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
			<button type="button" class="mfa-challenge__action" onclick={startOver}>
				Back to sign in
			</button>
		{:else if status === 'succeeded'}
			<svelte:element
				this={`h${headingLevel}`}
				class="mfa-challenge__title"
				tabindex="-1"
				bind:this={successHeading}
			>
				Verification complete
			</svelte:element>
			<p class="mfa-challenge__body">Verification complete.</p>
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

			{#key formOwner}
				<Form store={activeFormStore} class="mfa-challenge__form">
					<FormField name="code">
						{#snippet children({ field, send })}
							<div class="mfa-challenge__field">
								<label class="mfa-challenge__label" for={codeId}>
									{isRecovery ? 'Recovery code' : 'Authentication code'}
								</label>
								<OneTimeCodeInput
									id={codeId}
									name="code"
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

					<button type="submit" class="mfa-challenge__submit" disabled={status !== 'idle' || flow.form.isValidating || flow.form.isSubmitting}>
						{isSubmitting ? 'Checking…' : submitLabel}
					</button>
				</Form>
			{/key}

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
						binding.flowStore.dispatch({
							type: 'methodChosen',
							method: isRecovery ? 'totp' : 'recovery_code'
						})}
				>
					{isRecovery ? 'Use your authenticator app instead' : 'Use a recovery code instead'}
				</button>
			{/if}

		{/if}

		<!--
			Outside the branches, as `ForgotPasswordForm` renders its own: a footer is
			usually a way out — back to sign in, or someone to ask — and dropping it on
			the expired branch removes it exactly when the user is most stuck.
		-->
		{#if footer}
			<div class="mfa-challenge__footer">{@render footer()}</div>
		{/if}
	</div>
{/if}

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
