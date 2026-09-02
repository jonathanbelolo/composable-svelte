<script lang="ts">
	/**
	 * Turning on an authenticator.
	 *
	 * **No QR code is drawn here, and that is deliberate.** Nothing in this
	 * repository can produce one — there is no QR capability in any package or in
	 * the lockfile, and no precedent for a satellite package computing SVG at all.
	 * Adding an encoder would make this the package's second runtime dependency,
	 * in a package whose identity is being backend-agnostic and dependency-light,
	 * for something that is not its defining concern.
	 *
	 * So the secret is rendered for manual entry — which every authenticator app
	 * supports and which is the only route available to someone setting up on the
	 * same device anyway — and the `qr` snippet receives the `otpauth://` URI so a
	 * consumer can plug in whatever renderer they already have, or a
	 * backend-rendered image.
	 *
	 * One store, not two: enrolling changes nothing about who you are.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import OneTimeCodeInput from './OneTimeCodeInput.svelte';
	import RecoveryCodes from './RecoveryCodes.svelte';
	import type { MfaEnrolmentAction, MfaEnrolmentState } from '../flows/mfa-enrolment/types.js';
	import type { MfaCodeFields } from '../flows/mfa-challenge/schema.js';

	/** How long a copy button confirms for. Long enough to read, short enough to retry. */
	const COPIED_FOR_MS = 2000;

	interface Props {
		flowStore: {
			readonly state: MfaEnrolmentState;
			dispatch(action: MfaEnrolmentAction): void;
			subscribe(listener: (state: MfaEnrolmentState) => void): () => void;
		};
		/**
		 * Renders the `otpauth://` URI however the consumer likes — usually a QR.
		 *
		 * Absent is a supported configuration, not a degraded one: the secret is
		 * shown for manual entry either way.
		 */
		qr?: Snippet<[{ otpauthUri: string; secret: string }]> | undefined;
		/**
		 * Called once, when the user acknowledges the recovery codes.
		 *
		 * Deliberately *not* called when enrolment completes. The codes are shown
		 * once and can never be retrieved again, so leaving the panel is the user's
		 * decision to make, not a transition to fire on their behalf.
		 */
		onDone?: (() => void) | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		submitLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		qr,
		onDone,
		headingLevel = 2,
		submitLabel = 'Turn on authentication',
		class: className = ''
	}: Props = $props();

	const uid = $props.id();
	const codeId = `${uid}-code`;
	const codeErrorId = `${uid}-code-error`;
	const secretId = `${uid}-secret`;

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
	const secret = $derived(flowStore.state.secret);
	const otpauthUri = $derived(flowStore.state.otpauthUri);
	const recoveryCodes = $derived(flowStore.state.recoveryCodes);
	const isSubmitting = $derived(status === 'submitting');

	/**
	 * Whether the mount effect has already asked for an enrolment.
	 *
	 * The same shape as `EmailVerification`'s guard and for the same reason: this
	 * dispatches from an effect, and an effect re-runs for reasons unrelated to
	 * its subject. A second start issues a new secret and silently invalidates
	 * the one already on screen. The reducer refuses too; both are wanted.
	 *
	 * **Never reset.** An earlier version had the retry button clear it, and that
	 * worked only because `started ||` short-circuits before the status read: a
	 * settled effect stops tracking status, so it cannot fire again. A guard held
	 * up by the order of two clauses. Reorder them and the effect keeps tracking;
	 * every failing retry then costs a second request nobody asked for, against a
	 * backend already refusing. Retrying dispatches directly instead — the reducer
	 * accepts it whenever the flow is idle — and this flag records only what the
	 * mount effect did.
	 */
	let started = false;

	$effect(() => {
		if (started) return;
		if (flowStore.state.status !== 'idle') return;
		started = true;
		flowStore.dispatch({ type: 'enrolmentRequested' });
	});

	/**
	 * What was last copied, if anything.
	 *
	 * Only the setup key can be copied from *this* component — the recovery panel
	 * is `RecoveryCodes`, with its own flag — and that separation is the fix, not
	 * a tidy-up. One flag shared by "Copy key" and "Copy codes" read fine, since
	 * the two buttons are never on screen together, but the component outlived
	 * the transition between them and copying the setup key left the recovery
	 * panel claiming the *codes* had been copied. That is the one screen where a
	 * false reassurance costs the account.
	 *
	 * Kept as a named value rather than a boolean so that adding a second copy
	 * button here forces that question again instead of quietly sharing a flag.
	 *
	 * It also clears itself, so a second copy of the same thing still confirms.
	 */
	let copied = $state<'key' | null>(null);
	let clearCopied: ReturnType<typeof setTimeout> | null = null;

	async function copy(what: 'key', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = what;
			if (clearCopied !== null) clearTimeout(clearCopied);
			clearCopied = setTimeout(() => {
				copied = null;
				clearCopied = null;
			}, COPIED_FOR_MS);
		} catch {
			// Clipboard access can be refused, and there is nothing useful to say
			// about it: the value is on screen and selectable either way.
			copied = null;
		}
	}

	$effect(() => () => {
		if (clearCopied !== null) clearTimeout(clearCopied);
	});
</script>

<div class="mfa-enrolment {className}">
	{#if status === 'enrolled' && recoveryCodes !== null}
		<RecoveryCodes codes={recoveryCodes} {headingLevel} onAcknowledged={onDone}>
			{#snippet intro()}
				<p class="mfa-enrolment__body">
					Authentication is on. These codes are the only way back in if you lose your device,
					and they are shown <strong>once</strong>. Save them somewhere safe now.
				</p>
			{/snippet}
		</RecoveryCodes>
	{:else if status === 'starting' || (status === 'idle' && error === null)}
		<svelte:element this={`h${headingLevel}`} class="mfa-enrolment__title">
			Set up authentication
		</svelte:element>
		<p class="mfa-enrolment__body" role="status" aria-live="polite">Preparing your setup key…</p>
	{:else if secret === null || otpauthUri === null}
		<!-- The start failed, and there is nothing to confirm against. -->
		<svelte:element this={`h${headingLevel}`} class="mfa-enrolment__title">
			Could not start setup
		</svelte:element>
		{#if error}
			<div class="mfa-enrolment__error" role="alert" aria-live="polite" data-error-code={error.code}>
				{error.message}
			</div>
		{/if}
		<button
			type="button"
			class="mfa-enrolment__action"
			onclick={() => flowStore.dispatch({ type: 'enrolmentRequested' })}
		>
			Try again
		</button>
	{:else}
		<svelte:element this={`h${headingLevel}`} class="mfa-enrolment__title">
			Set up authentication
		</svelte:element>

		{#if qr}
			{@render qr({ otpauthUri, secret })}
		{/if}

		<div class="mfa-enrolment__secret">
			<p class="mfa-enrolment__body">
				{#if qr}
					Scan the code above, or enter this key by hand:
				{:else}
					Add this key to your authenticator app:
				{/if}
			</p>
			<!--
				A `<p>` and not an input: it is not editable, and a read-only input
				would invite someone to try. Selectable, with tabular figures, so it
				can be read aloud or copied by hand.
			-->
			<p class="mfa-enrolment__key" id={secretId}>{secret}</p>
			<button type="button" class="mfa-enrolment__secondary" onclick={() => copy('key', secret)}>
				{copied === 'key' ? 'Copied' : 'Copy key'}
			</button>
		</div>

		{#if error}
			<div class="mfa-enrolment__error" role="alert" aria-live="polite" data-error-code={error.code}>
				{error.message}
			</div>
		{/if}

		<Form store={formStore} class="mfa-enrolment__form">
			<FormField name="code">
				{#snippet children({ field, send })}
					<div class="mfa-enrolment__field">
						<label class="mfa-enrolment__label" for={codeId}>
							Enter the code your app shows
						</label>
						<OneTimeCodeInput
							id={codeId}
							name="code"
							value={field.value}
							invalid={!!field.error}
							errorId={codeErrorId}
							placeholder="123456"
							oninput={(event) =>
								send({ type: 'fieldChanged', field: 'code', value: event.currentTarget.value })}
						/>
						{#if field.error}
							<p class="mfa-enrolment__field-error" id={codeErrorId} role="alert" aria-live="polite">
								{field.error}
							</p>
						{/if}
					</div>
				{/snippet}
			</FormField>

			<p class="mfa-enrolment__status" role="status" aria-live="polite">
				{isSubmitting ? 'Checking your code…' : ''}
			</p>

			<button type="submit" class="mfa-enrolment__submit" disabled={isSubmitting}>
				{isSubmitting ? 'Checking…' : submitLabel}
			</button>
		</Form>
	{/if}
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.mfa-enrolment {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
		max-width: 26rem;
		padding: 2rem;
		color: hsl(var(--card-foreground, 222.2 84% 4.9%));
		background: hsl(var(--card, 0 0% 100%));
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
		border-radius: 0.5rem;
	}

	.mfa-enrolment__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.mfa-enrolment :global(form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.mfa-enrolment__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.mfa-enrolment__secret {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: flex-start;
		padding: 0.75rem;
		background: hsl(var(--muted, 210 40% 96.1%));
		border-radius: 0.375rem;
	}

	.mfa-enrolment__key {
		margin: 0;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.15em;
		word-break: break-all;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		user-select: all;
	}

	.mfa-enrolment__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.mfa-enrolment__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.mfa-enrolment__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.mfa-enrolment__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	/* Visually hidden, still announced. */
	.mfa-enrolment__status {
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

	.mfa-enrolment__submit,
	.mfa-enrolment__action {
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

	.mfa-enrolment__action {
		align-self: flex-start;
	}

	.mfa-enrolment__secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		padding: 0 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: transparent;
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.mfa-enrolment__submit:hover:not(:disabled),
	.mfa-enrolment__action:hover {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.mfa-enrolment__secondary:hover {
		background: hsl(var(--accent, 210 40% 96.1%));
	}

	.mfa-enrolment__submit:focus-visible,
	.mfa-enrolment__action:focus-visible,
	.mfa-enrolment__secondary:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.mfa-enrolment__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
