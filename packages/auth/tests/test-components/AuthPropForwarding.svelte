<script lang="ts">
	import AuthGuard from '../../src/lib/components/AuthGuard.svelte';
	import RoleGate from '../../src/lib/components/RoleGate.svelte';
	import LoginForm from '../../src/lib/components/LoginForm.svelte';
	import PasswordInput from '../../src/lib/components/PasswordInput.svelte';
	import type { AuthError } from '../../src/lib/errors/types.js';
	import type { LoginAction, LoginState } from '../../src/lib/flows/login/types.js';
	import type { SessionAction, SessionState } from '../../src/lib/session/types.js';
	import type { Snippet } from 'svelte';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped at all.
	 *
	 * **This file's own props are deliberately bare.** That is the entire
	 * mechanism: they simulate the naïve consumer whose `$props()` yields
	 * `T | undefined`. A sweep that "fixes" them here would neutralise the
	 * fixture and nothing would go red. Every `tests` directory is out of scope
	 * for exactly this reason.
	 */
	let {
		store,
		onAnonymous,
		children,
		fallback,
		pending,
		roles,
		gateChildren,
		gateFallback,
		flowStore,
		sessionStore,
		onSuccess,
		header,
		footer,
		submitLabel,
		emailLabel,
		passwordLabel,
		rememberLabel,
		formClass,
		fieldId,
		value,
		oninput,
		onblur,
		invalid,
		errorId,
		autocomplete,
		placeholder,
		disabled,
		showLabel,
		hideLabel,
		inputClass
	}: {
		store: { readonly state: SessionState };
		onAnonymous?: () => void;
		children?: Snippet<[{ isRevalidating: boolean }]>;
		fallback?: Snippet<[{ error: AuthError | null }]>;
		pending?: Snippet;
		roles: readonly string[];
		// `RoleGate`'s snippets take no parameters, so they get their own props
		// rather than sharing `AuthGuard`'s — otherwise the arity mismatch is
		// what fails and the `| undefined` question never gets asked.
		gateChildren?: Snippet;
		gateFallback?: Snippet;

		// LoginForm. `flowStore` and `sessionStore` are required, so they are the
		// one pair here that is not deliberately bare — a required prop cannot be
		// `undefined` and there is nothing to prove about it.
		flowStore: {
			readonly state: LoginState;
			dispatch(action: LoginAction): void;
			subscribe(listener: (state: LoginState) => void): () => void;
		};
		sessionStore: { dispatch(action: SessionAction): void };
		onSuccess?: () => void;
		header?: Snippet;
		footer?: Snippet;
		submitLabel?: string;
		emailLabel?: string;
		passwordLabel?: string;
		rememberLabel?: string;
		// `class` cannot be a binding name, so both components' class props are
		// renamed here and passed through explicitly below.
		formClass?: string;

		// PasswordInput.
		fieldId: string;
		value: string;
		oninput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onblur?: () => void;
		invalid?: boolean;
		errorId?: string;
		autocomplete?: 'current-password' | 'new-password';
		placeholder?: string;
		disabled?: boolean;
		showLabel?: string;
		hideLabel?: string;
		inputClass?: string;
	} = $props();
</script>

<AuthGuard {store} {onAnonymous} {children} {fallback} {pending} />
<RoleGate {store} {roles} children={gateChildren} fallback={gateFallback} {pending} />
<LoginForm
	{flowStore}
	{sessionStore}
	{onSuccess}
	{header}
	{footer}
	{submitLabel}
	{emailLabel}
	{passwordLabel}
	{rememberLabel}
	class={formClass}
/>
<PasswordInput
	id={fieldId}
	{value}
	{oninput}
	{onblur}
	{invalid}
	{errorId}
	{autocomplete}
	{placeholder}
	{disabled}
	{showLabel}
	{hideLabel}
	class={inputClass}
/>
