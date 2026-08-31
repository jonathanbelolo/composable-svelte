<script lang="ts">
	/**
	 * A password field with a show/hide toggle.
	 *
	 * Nothing like this exists in the repository, and there is no icon system, so
	 * both eye paths are authored here in the house style — inline SVG,
	 * `fill="none"`, `stroke="currentColor"`.
	 *
	 * **Scoped CSS reading core's theme tokens.** Utility classes cannot be used:
	 * the Tailwind preset's content glob covers core's `dist` only, so anything
	 * in `auth/dist` is purged in a consumer app and renders unstyled. But
	 * `hsl(var(--border, …))` costs the same as a hex literal and follows the
	 * consumer's theme and dark mode when core's stylesheet is present, falling
	 * back when it is not. The other satellite packages hardcode hex and are
	 * therefore un-restylable; this one is not.
	 *
	 * Pattern A: it animates nothing. Focus and hover change instantly.
	 */
	interface Props {
		/** The field's `id`, which a `<label for>` must match. */
		id: string;
		/**
		 * The form control name.
		 *
		 * Not redundant with `id`. Password managers key on `autocomplete` first
		 * but fall back to `name` heuristics, and `id` here is per-instance
		 * (`$props.id()` output in `LoginForm`), so it carries no meaning for
		 * them.
		 */
		name?: string | undefined;
		value: string;
		/** Wired to `oninput`, not `onchange`, so a strength meter can react per keystroke. */
		oninput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onblur?: (() => void) | undefined;
		/** Marks the field invalid and points `aria-describedby` at `errorId`. */
		invalid?: boolean | undefined;
		errorId?: string | undefined;
		/** `current-password` when signing in, `new-password` when choosing one. */
		autocomplete?: 'current-password' | 'new-password' | undefined;
		placeholder?: string | undefined;
		disabled?: boolean | undefined;
		/** Accessible name for the toggle when the password is hidden. */
		showLabel?: string | undefined;
		/** …and when it is visible. */
		hideLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		id,
		name,
		value,
		oninput,
		onblur,
		invalid = false,
		errorId,
		autocomplete = 'current-password',
		placeholder,
		disabled = false,
		showLabel = 'Show password',
		hideLabel = 'Hide password',
		class: className = ''
	}: Props = $props();

	/**
	 * Whether the password is legible.
	 *
	 * Genuinely local, ephemeral UI state — nothing in the store cares, and it
	 * must not survive a remount. This is the case `$state` is for.
	 */
	let visible = $state(false);
</script>

<div class="password-input {className}">
	<input
		{id}
		{name}
		type={visible ? 'text' : 'password'}
		{value}
		{placeholder}
		{disabled}
		{autocomplete}
		{oninput}
		onblur={() => onblur?.()}
		class="password-input__field"
		class:password-input__field--invalid={invalid}
		aria-invalid={invalid ? 'true' : undefined}
		aria-describedby={invalid && errorId ? errorId : undefined}
	/>

	<!--
		A bare button rather than core's `IconButton`: that one is Tailwind, and
		its smallest size is 32px inside a 40px field.

		Tabbable, unlike `Combobox`'s chevron which sets `tabindex="-1"` because
		the input already offers the same action by keyboard. Revealing a password
		has no keyboard equivalent, so removing it from the tab order would remove
		the affordance entirely for anyone not using a pointer.
	-->
	<button
		type="button"
		class="password-input__toggle"
		aria-label={visible ? hideLabel : showLabel}
		aria-pressed={visible}
		aria-controls={id}
		{disabled}
		onclick={() => (visible = !visible)}
	>
		{#if visible}
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
				<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
				<path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
				<line x1="2" x2="22" y1="2" y2="22" />
			</svg>
		{:else}
			<svg
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
				<circle cx="12" cy="12" r="3" />
			</svg>
		{/if}
	</button>
</div>

<style>
	.password-input {
		position: relative;
		display: block;
	}

	.password-input__field {
		display: block;
		width: 100%;
		height: 2.5rem;
		/* Room for the toggle, which sits on top of the field. */
		padding: 0.5rem 2.5rem 0.5rem 0.75rem;
		font: inherit;
		font-size: 0.875rem;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--input, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
	}

	/*
	 * Tailwind's preflight strips these from `input`, so every one is set
	 * explicitly rather than inherited from the browser default.
	 */
	.password-input__field::placeholder {
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.password-input__field:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.password-input__field:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.password-input__field--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.password-input__field--invalid:focus-visible {
		outline-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}

	.password-input__toggle {
		position: absolute;
		top: 0;
		right: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		padding: 0;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
		background: none;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.password-input__toggle:hover:not(:disabled) {
		color: hsl(var(--foreground, 222.2 84% 4.9%));
	}

	.password-input__toggle:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: -2px;
	}

	.password-input__toggle:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
