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
	import type { MfaEnrolmentAction, MfaEnrolmentState } from '../flows/mfa-enrolment/types.js';
	import type { MfaCodeFields } from '../flows/mfa-challenge/schema.js';

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
	 * Whether this component has asked for an enrolment.
	 *
	 * The same shape as `EmailVerification`'s guard and for the same reason: this
	 * dispatches from an effect, and an effect re-runs for reasons unrelated to
	 * its subject. A second start issues a new secret and silently invalidates
	 * the one already on screen. The reducer refuses too; both are wanted.
	 */
	let started = false;

	$effect(() => {
		if (started || flowStore.state.status !== 'idle') return;
		// Reading status keeps this honest: nothing is recorded as started until
		// the flow is actually in a state to take it.
		started = true;
		flowStore.dispatch({ type: 'enrolmentRequested' });
	});

	/** The recovery panel, focused when it replaces the form. */
	let panel = $state<HTMLElement | null>(null);

	$effect(() => {
		if (status === 'enrolled') panel?.focus();
	});

	let copied = $state(false);

	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
		} catch {
			// Clipboard access can be refused, and there is nothing useful to say
			// about it: the value is on screen and selectable either way.
			copied = false;
		}
	}
</script>

<div class="mfa-enrolment {className}">
	{#if status === 'enrolled' && recoveryCodes !== null}
		<div
			bind:this={panel}
			class="mfa-enrolment__panel"
			role="status"
			aria-live="polite"
			tabindex="-1"
		>
			<svelte:element this={`h${headingLevel}`} class="mfa-enrolment__title">
				Save your recovery codes
			</svelte:element>
			<!--
				`role="alert"` would be wrong — nothing failed — but this is the one
				thing on the page that cannot be recovered if ignored, so it is not
				phrased as a congratulation.
			-->
			<p class="mfa-enrolment__body">
				Authentication is on. These codes are the only way back in if you lose your device, and
				they are shown <strong>once</strong>. Save them somewhere safe now.
			</p>

			<ul class="mfa-enrolment__codes">
				{#each recoveryCodes as code (code)}
					<li>{code}</li>
				{/each}
			</ul>

			<div class="mfa-enrolment__row">
				<button
					type="button"
					class="mfa-enrolment__secondary"
					onclick={() => copy(recoveryCodes.join('\n'))}
				>
					{copied ? 'Copied' : 'Copy codes'}
				</button>
				{#if onDone}
					<button type="button" class="mfa-enrolment__action" onclick={() => onDone()}>
						I have saved them
					</button>
				{/if}
			</div>
		</div>
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
			onclick={() => {
				started = false;
				flowStore.dispatch({ type: 'enrolmentRequested' });
			}}
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
			<button type="button" class="mfa-enrolment__secondary" onclick={() => copy(secret)}>
				{copied ? 'Copied' : 'Copy key'}
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

	.mfa-enrolment__panel {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.mfa-enrolment__panel:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
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

	.mfa-enrolment__codes {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.25rem 1rem;
		margin: 0;
		padding: 0.75rem;
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 0.875rem;
		list-style: none;
		background: hsl(var(--muted, 210 40% 96.1%));
		border-radius: 0.375rem;
		user-select: all;
	}

	.mfa-enrolment__row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
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
