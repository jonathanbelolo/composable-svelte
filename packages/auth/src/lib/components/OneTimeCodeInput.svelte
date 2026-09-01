<script lang="ts">
	/**
	 * A field for a one-time code.
	 *
	 * **One input, not six boxes** — and that is the whole design decision, so it
	 * is worth stating why, because split boxes are what a reader will expect.
	 *
	 * A single field with `autocomplete="one-time-code"` is what iOS and Android
	 * autofill into from an SMS or an authenticator. It pastes correctly with no
	 * handler. It has one label, one error, and one place for focus to be. Split
	 * boxes have to re-implement paste-across-fields, backspace-to-previous and
	 * arrow keys, and they announce to a screen reader as six unlabelled inputs
	 * unless every one of them is worked around individually. The accessibility
	 * guidance favours the single field, and this package has spent five flows
	 * asserting accessibility rather than assuming it.
	 *
	 * `inputmode="numeric"` rather than `type="number"`: number inputs bring a
	 * spinner, drop leading zeros, and accept `e` and `-`. A code is a string of
	 * characters that happen to be digits, not a quantity.
	 *
	 * `maxlength` is a **hint**, defaulting to nothing. A recovery code is a
	 * different shape from a TOTP code, and truncating a paste is worse than
	 * letting the backend judge.
	 *
	 * Pattern A: it animates nothing.
	 */
	interface Props {
		/** The field's `id`, which a `<label for>` must match. */
		id: string;
		/**
		 * The form field name. Required, as every other input in this package has
		 * one: it is what a native submission and a browser's form restore key on,
		 * and this was the single field that omitted it.
		 */
		name: string;
		value: string;
		oninput: (event: Event & { currentTarget: HTMLInputElement }) => void;
		onblur?: (() => void) | undefined;
		invalid?: boolean | undefined;
		errorId?: string | undefined;
		/** Something that describes the field whether or not it is valid. */
		describedBy?: string | undefined;
		/**
		 * Whether the OS should offer a one-time code here.
		 *
		 * `true` for an authenticator or SMS code. **`false` for a recovery code**:
		 * those are not one-time codes in the sense the browser means, and offering
		 * an SMS autofill for one is a confusing prompt at a bad moment.
		 */
		oneTimeCode?: boolean | undefined;
		/** A length hint. Not enforced — see above. */
		maxlength?: number | undefined;
		placeholder?: string | undefined;
		disabled?: boolean | undefined;
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
		describedBy,
		oneTimeCode = true,
		maxlength,
		placeholder,
		disabled = false,
		class: className = ''
	}: Props = $props();
</script>

<input
	{id}
	{name}
	type="text"
	{value}
	{placeholder}
	{disabled}
	{maxlength}
	inputmode="numeric"
	autocomplete={oneTimeCode ? 'one-time-code' : 'off'}
	autocapitalize="off"
	autocorrect="off"
	spellcheck="false"
	{oninput}
	onblur={() => onblur?.()}
	class="one-time-code {className}"
	class:one-time-code--invalid={invalid}
	aria-invalid={invalid ? 'true' : undefined}
	aria-describedby={[describedBy, invalid && errorId ? errorId : null].filter(Boolean).join(' ') ||
		undefined}
/>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.one-time-code {
		display: block;
		width: 100%;
		height: 2.75rem;
		padding: 0.5rem 0.75rem;
		font: inherit;
		/*
		 * Tabular figures and a little tracking, so a code is read in groups
		 * rather than as a word. This is the one thing split boxes do well, and it
		 * costs two declarations instead of a keyboard-handling subsystem.
		 */
		font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
		font-size: 1.125rem;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.25em;
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: hsl(var(--background, 0 0% 100%));
		border: 1px solid hsl(var(--input, 214.3 31.8% 91.4%));
		border-radius: 0.375rem;
	}

	.one-time-code::placeholder {
		letter-spacing: normal;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.one-time-code:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}

	.one-time-code:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.one-time-code--invalid {
		border-color: hsl(var(--destructive, 0 84.2% 60.2%));
	}
</style>
