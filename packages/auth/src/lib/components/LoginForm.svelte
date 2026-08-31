<script lang="ts">
	/**
	 * A sign-in form.
	 *
	 * Takes both stores, deliberately. The flow store owns the fields and the
	 * request; the session store owns "who am I". A completed sign-in has to
	 * cross between them, and passing both makes that crossing a required prop —
	 * omit it and the compiler objects. The alternatives (composing the flow into
	 * a parent reducer, or injecting an `onSessionEstablished` callback) both fail
	 * *silently* when forgotten: the sign-in succeeds and the session never
	 * updates, with nothing to typecheck against.
	 *
	 * Core's `Form` and `FormField` are used because they are unstyled state
	 * plumbing — `<form novalidate>` and `<div data-field>`. `FormItem`,
	 * `FormLabel` and `FormMessage` are not: they are Tailwind, and a utility
	 * class in `auth/dist` is purged in every consumer app. So the accessibility
	 * wiring `FormMessage` implements — `role="alert"`, `aria-live="polite"`, an
	 * `id` the input's `aria-describedby` points at — is written out here and
	 * asserted in the tests rather than inherited.
	 *
	 * `FormControl` is avoided for a separate reason: its props bag wires
	 * `onchange`, so a text input would not update until blur. All three form
	 * examples in the repo hand-wire `oninput` for the same reason.
	 */
	import { Form, FormField } from '@composable-svelte/core/components/form';
	import type { FormAction, FormState } from '@composable-svelte/core/components/form';
	import type { Snippet } from 'svelte';

	import PasswordInput from './PasswordInput.svelte';
	import type { LoginAction, LoginState } from '../flows/login/types.js';
	import type { LoginFields } from '../flows/login/schema.js';
	import type { SessionAction } from '../session/types.js';

	interface Props {
		/**
		 * The sign-in flow: fields, request, structured failure.
		 *
		 * `subscribe` is required because `FormField` reads `$store.data[name]` —
		 * the auto-subscription form — and this component projects the form slice
		 * out of the flow state for it.
		 */
		flowStore: {
			readonly state: LoginState;
			dispatch(action: LoginAction): void;
			subscribe(listener: (state: LoginState) => void): () => void;
		};
		/**
		 * Where a completed sign-in is handed over.
		 *
		 * Narrow on purpose — only `dispatch` is used — so a scoped store, or a
		 * store whose action type a parent has wrapped, satisfies it. Same
		 * reasoning as `AuthGuard`, which asks only for `state`.
		 */
		sessionStore: { dispatch(action: SessionAction): void };
		/** Called once, after the session has been established. For navigation. */
		onSuccess?: (() => void) | undefined;
		/** Replaces the heading. */
		header?: Snippet | undefined;
		/** Rendered below the form — "forgot password?", a link to signup. */
		footer?: Snippet | undefined;
		submitLabel?: string | undefined;
		emailLabel?: string | undefined;
		passwordLabel?: string | undefined;
		rememberLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		flowStore,
		sessionStore,
		onSuccess,
		header,
		footer,
		submitLabel = 'Sign in',
		emailLabel = 'Email',
		passwordLabel = 'Password',
		rememberLabel = 'Keep me signed in',
		class: className = ''
	}: Props = $props();

	/**
	 * Per-instance ids, so two of these on one page do not collide.
	 *
	 * `FormMessage` derives `id="{fieldName}-error"`, which is fine for the one
	 * form it was written for and wrong for a component a consumer may mount
	 * twice — a signup panel beside a sign-in panel would give two elements
	 * `id="password-error"` and `aria-describedby` would resolve to whichever
	 * came first. `$props.id()` is the repo's answer to this already (`Chart`,
	 * `Light`).
	 */
	const uid = $props.id();
	const emailId = `${uid}-email`;
	const emailErrorId = `${uid}-email-error`;
	const passwordId = `${uid}-password`;
	const passwordErrorId = `${uid}-password-error`;
	const rememberId = `${uid}-remember`;

	/**
	 * The form slice, as core's form components expect it.
	 *
	 * Built once and never replaced: `Form.svelte` captures the store into
	 * context at init, so a new object each render would leave every `FormField`
	 * reading a dead one. `state` is a getter over `flowStore.state` rather than
	 * a `$state` mirror — the mirror the examples use lags by an effect flush,
	 * and `store.state` is already `$state.raw`-backed, so reads track without
	 * one.
	 */
	const formStore = {
		get state(): FormState<LoginFields> {
			return flowStore.state.form;
		},
		dispatch(action: FormAction<LoginFields>) {
			flowStore.dispatch({ type: 'form', action });
		},
		subscribe(listener: (state: FormState<LoginFields>) => void) {
			// The form slice, not the flow state: `FormField` reads
			// `$store.data[name]` and `LoginState` has no `data`.
			return flowStore.subscribe((state) => listener(state.form));
		}
	};

	const error = $derived(flowStore.state.error);
	const isSubmitting = $derived(flowStore.state.status === 'submitting');

	/**
	 * Whether the session has already been handed *this* result.
	 *
	 * A plain `let`, not `$state`: it records what this component has already
	 * done, not a fact about the domain — the animation-guard convention. The
	 * same shape as `AuthGuard.onAnonymous`, which has a whole test file devoted
	 * to firing once per entry rather than once per dispatch.
	 *
	 * Cleared whenever the flow leaves `succeeded`, which is what makes it "once
	 * per sign-in" rather than "once per lifetime". A form that stays mounted
	 * across a sign-out and a second sign-in — a modal the app keeps alive, a
	 * login route it returns to — would otherwise establish the first session and
	 * silently drop every one after it. Keying on the snapshot's identity instead
	 * would look equivalent and is not: a fake that returns the same object twice
	 * (which `createMockAuthDeps` does) would be indistinguishable from a repeat.
	 */
	let handedOver = false;

	$effect(() => {
		const { status, session } = flowStore.state;
		if (status !== 'succeeded') {
			handedOver = false;
			return;
		}
		if (session === null || handedOver) return;
		handedOver = true;
		sessionStore.dispatch({ type: 'sessionEstablished', session });
		onSuccess?.();
	});
</script>

<div class="login-form {className}">
	{#if header}
		{@render header()}
	{:else}
		<h1 class="login-form__title">Sign in</h1>
	{/if}

	{#if error}
		<!--
			The form-level failure. `role="alert"` plus `aria-live="polite"` is the
			pairing `FormMessage` uses for field errors; core has no component for a
			form-level one, so it is spelled out. `data-error-code` is what lets a
			consumer style or test the branch — it is the whole point of `AuthError`
			being a union rather than a string.
		-->
		<div class="login-form__error" role="alert" aria-live="polite" data-error-code={error.code}>
			{error.message}
		</div>
	{/if}

	<Form store={formStore} class="login-form__form">
		<FormField name="email">
			{#snippet children({ field, send })}
				<div class="login-form__field">
					<label class="login-form__label" for={emailId}>{emailLabel}</label>
					<input
						id={emailId}
						type="email"
						autocomplete="username"
						class="login-form__input"
						class:login-form__input--invalid={!!field.error}
						value={field.value}
						aria-invalid={field.error ? 'true' : undefined}
						aria-describedby={field.error ? emailErrorId : undefined}
						oninput={(event) =>
							send({ type: 'fieldChanged', field: 'email', value: event.currentTarget.value })}
						onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
					/>
					{#if field.error}
						<p class="login-form__field-error" id={emailErrorId} role="alert" aria-live="polite">
							{field.error}
						</p>
					{/if}
				</div>
			{/snippet}
		</FormField>

		<FormField name="password">
			{#snippet children({ field, send })}
				<div class="login-form__field">
					<label class="login-form__label" for={passwordId}>{passwordLabel}</label>
					<PasswordInput
						id={passwordId}
						value={field.value}
						invalid={!!field.error}
						errorId={passwordErrorId}
						autocomplete="current-password"
						oninput={(event) =>
							send({ type: 'fieldChanged', field: 'password', value: event.currentTarget.value })}
						onblur={() => send({ type: 'fieldBlurred', field: 'password' })}
					/>
					{#if field.error}
						<p class="login-form__field-error" id={passwordErrorId} role="alert" aria-live="polite">
							{field.error}
						</p>
					{/if}
				</div>
			{/snippet}
		</FormField>

		<FormField name="rememberMe">
			{#snippet children({ field, send })}
				<div class="login-form__remember">
					<input
						id={rememberId}
						type="checkbox"
						class="login-form__checkbox"
						checked={field.value === true}
						onchange={(event) =>
							send({
								type: 'fieldChanged',
								field: 'rememberMe',
								value: event.currentTarget.checked
							})}
					/>
					<label class="login-form__label" for={rememberId}>{rememberLabel}</label>
				</div>
			{/snippet}
		</FormField>

		<!--
			Genuinely disabled while in flight, not merely relabelled. Core's form
			reducer has no re-entrancy guard, and two of the three form examples only
			swap the label — so they do not prevent a double submit. Here that is a
			duplicate authentication attempt, which is how a user trips a rate limiter
			by double-clicking. Disabling the *default* button also suppresses
			implicit submission, so Enter in a field cannot get around it either.

			The fields deliberately stay live. Disabling them buys nothing — the
			credentials were captured when the request was dispatched — and costs
			something real: submitting with Enter leaves focus in the password field,
			and disabling the focused element drops focus to `<body>`.
		-->
		<button type="submit" class="login-form__submit" disabled={isSubmitting}>
			{isSubmitting ? 'Signing in…' : submitLabel}
		</button>
	</Form>

	{#if footer}
		<div class="login-form__footer">{@render footer()}</div>
	{/if}
</div>

<style>
	/*
	 * Scoped CSS reading core's theme tokens. Utility classes cannot be used —
	 * the Tailwind preset's content glob covers core's dist only, so anything
	 * here would be purged in a consumer app — but `hsl(var(--token, fallback))`
	 * costs the same as a hex literal and follows the consumer's theme and dark
	 * mode when core's stylesheet is present, falling back when it is not. Every
	 * colour below is a token, deliberately: the other satellite packages
	 * hardcode hex and therefore cannot be restyled at all.
	 *
	 * Tailwind's preflight strips button and input defaults, so anything relied
	 * on is set explicitly rather than inherited from the browser.
	 */
	.login-form {
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

	.login-form__title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 600;
		line-height: 1.2;
	}

	/*
	 * `:global`, because this class lands on the `<form>` that `Form.svelte`
	 * renders — a different component, so Svelte's scoping hash is not applied
	 * to it. Prefixed, so it is not a name a consumer could collide with.
	 */
	:global(.login-form__form) {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.login-form__field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.login-form__label {
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1;
	}

	.login-form__input {
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

	.login-form__input:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.login-form__input--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.login-form__field-error {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.login-form__error {
		padding: 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--destructive, 0 84.2% 60.2%));
		background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.1);
		border: 1px solid hsl(var(--destructive, 0 84.2% 60.2%) / 0.3);
		border-radius: 0.375rem;
	}

	.login-form__remember {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.login-form__checkbox {
		width: 1rem;
		height: 1rem;
		accent-color: hsl(var(--primary, 222.2 47.4% 11.2%));
	}

	.login-form__submit {
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

	.login-form__submit:hover:not(:disabled) {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.login-form__submit:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.login-form__submit:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.login-form__footer {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}
</style>
