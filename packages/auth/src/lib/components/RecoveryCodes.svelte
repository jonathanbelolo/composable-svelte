<script lang="ts">
	/**
	 * The one-time recovery codes, and the panel that insists you save them.
	 *
	 * Extracted from `MfaEnrolment` rather than copied, because enrolment and
	 * regeneration produce the identical thing and this panel carries a fix that
	 * must not be able to diverge between them: a copy confirmation that lies
	 * costs the account, since the codes are shown once and someone who believes
	 * they already have them closes the panel without them.
	 *
	 * The extraction is itself part of that fix. In `MfaEnrolment` the setup key
	 * and the codes shared one `copied` flag, and copying the key left this panel
	 * claiming the codes had been copied. Now the two buttons live in different
	 * components with different flags, and the two branches are never mounted
	 * together — so the bug is structurally unavailable rather than carefully
	 * avoided.
	 *
	 * Pattern A: it animates nothing.
	 */
	import type { Snippet } from 'svelte';

	/** How long a copy confirmation stays up. Clears itself, so a second copy still confirms. */
	const COPIED_FOR_MS = 2000;

	interface Props {
		/** Shown once, and never retrievable. */
		codes: readonly string[];
		/**
		 * Whether these replace an earlier set.
		 *
		 * Changes the wording, and it is not cosmetic: someone who regenerated has
		 * an older list saved somewhere that has just stopped working, and a panel
		 * that does not say so leaves them holding dead codes they trust.
		 */
		replaced?: boolean | undefined;
		headingLevel?: 1 | 2 | 3 | 4 | undefined;
		/**
		 * Called when the user says they have saved them.
		 *
		 * Optional — a surface may prefer the codes to stay until it navigates.
		 * When absent the button is not rendered, rather than rendered inert.
		 */
		onAcknowledged?: (() => void) | undefined;
		acknowledgeLabel?: string | undefined;
		/** Replaces the default explanation. The heading and the codes stay. */
		intro?: Snippet | undefined;
		class?: string | undefined;
	}

	let {
		codes,
		replaced = false,
		headingLevel = 2,
		onAcknowledged,
		acknowledgeLabel,
		intro,
		class: className = ''
	}: Props = $props();

	let root = $state<HTMLElement | null>(null);

	/**
	 * Focused when it appears, and again when a *new* set replaces it.
	 *
	 * `codes` is tracked deliberately: a regeneration leaves this component
	 * mounted, and a silent swap of ten strings someone must copy is the change
	 * most worth moving focus for.
	 */
	$effect(() => {
		void codes;
		root?.focus();
	});

	/**
	 * Whether the codes were just copied.
	 *
	 * A boolean is safe *here* because there is exactly one thing to copy in this
	 * component. It is written as a named value rather than a bare flag so that
	 * adding a second copy button forces the question that was got wrong once —
	 * see the note at the top.
	 */
	let copied = $state<'codes' | null>(null);
	let clearCopied: ReturnType<typeof setTimeout> | null = null;

	async function copy() {
		try {
			await navigator.clipboard.writeText(codes.join('\n'));
			copied = 'codes';
			if (clearCopied !== null) clearTimeout(clearCopied);
			clearCopied = setTimeout(() => {
				copied = null;
				clearCopied = null;
			}, COPIED_FOR_MS);
		} catch {
			// Clipboard access can be refused, and there is nothing useful to say
			// about it: the codes are on screen and selectable either way.
			copied = null;
		}
	}

	$effect(() => () => {
		if (clearCopied !== null) clearTimeout(clearCopied);
	});
</script>

<div
	bind:this={root}
	class="recovery-codes {className}"
	role="status"
	aria-live="polite"
	tabindex="-1"
>
	<svelte:element this={`h${headingLevel}`} class="recovery-codes__title">
		Save your recovery codes
	</svelte:element>

	<!--
		`role="alert"` would be wrong — nothing failed — but this is the one thing
		on the page that cannot be recovered if ignored, so it is not phrased as a
		congratulation.
	-->
	{#if intro}
		{@render intro()}
	{:else if replaced}
		<p class="recovery-codes__body">
			These replace your previous codes, which no longer work. Like the last set they are shown
			<strong>once</strong>. Save them somewhere safe now, and delete the old ones.
		</p>
	{:else}
		<p class="recovery-codes__body">
			These codes are the only way back in if you lose your device, and they are shown
			<strong>once</strong>. Save them somewhere safe now.
		</p>
	{/if}

	<ul class="recovery-codes__list">
		{#each codes as code (code)}
			<li>{code}</li>
		{/each}
	</ul>

	<div class="recovery-codes__row">
		<button type="button" class="recovery-codes__secondary" onclick={() => copy()}>
			{copied === 'codes' ? 'Copied' : 'Copy codes'}
		</button>
		{#if onAcknowledged}
			<button type="button" class="recovery-codes__action" onclick={() => onAcknowledged()}>
				{acknowledgeLabel ?? 'I have saved them'}
			</button>
		{/if}
	</div>
</div>

<style>
	/* Scoped CSS over core's theme tokens — see `LoginForm` for why not Tailwind. */
	.recovery-codes {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.recovery-codes:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 4px;
	}

	.recovery-codes__title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.recovery-codes__body {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.recovery-codes__list {
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
		/* The clipboard can be refused. This is what makes "selectable anyway" a
		   single click rather than a careful drag across ten strings. */
		user-select: all;
	}

	.recovery-codes__row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.recovery-codes__action,
	.recovery-codes__secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		padding: 0 1rem;
		font: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.375rem;
		cursor: pointer;
	}

	.recovery-codes__action {
		color: hsl(var(--primary-foreground, 210 40% 98%));
		background: hsl(var(--primary, 222.2 47.4% 11.2%));
		border: none;
	}

	.recovery-codes__action:hover {
		background: hsl(var(--primary, 222.2 47.4% 11.2%) / 0.9);
	}

	.recovery-codes__secondary {
		color: hsl(var(--foreground, 222.2 84% 4.9%));
		background: transparent;
		border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
	}

	.recovery-codes__secondary:hover {
		background: hsl(var(--muted, 210 40% 96.1%));
	}

	.recovery-codes__action:focus-visible,
	.recovery-codes__secondary:focus-visible {
		outline: 2px solid hsl(var(--ring, 222.2 84% 4.9%));
		outline-offset: 2px;
	}
</style>
