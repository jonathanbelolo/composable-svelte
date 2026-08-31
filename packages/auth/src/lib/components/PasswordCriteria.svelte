<script lang="ts">
	/**
	 * The password requirements, with each one's current verdict.
	 *
	 * Derived from `passwordCriteria`, which is derived from the same constants
	 * the schema validates against — so this cannot tell a user they are done
	 * while the form disagrees. A test asserts the two agree on every sample.
	 *
	 * **Phrased as requirements, not failures.** An unmet criterion is neutral,
	 * not red: nothing has gone wrong when someone is halfway through typing a
	 * password. That is also why signup validates `onBlur` rather than
	 * `onChange` — this list is the live feedback, and it does not scold.
	 *
	 * **Deliberately not a live region.** Announcing on every keystroke is
	 * unusable with a screen reader — one interruption per character. Each item
	 * instead carries a visually hidden "Met" / "Not met" that is read when the
	 * user navigates to the list, which the field points at through
	 * `aria-describedby`.
	 *
	 * Pattern A: it animates nothing.
	 */
	import { evaluatePasswordCriteria } from '../flows/signup/schema.js';

	interface Props {
		/** The password as typed. Evaluated on every keystroke. */
		password: string;
		/** The list's `id`, for the field's `aria-describedby`. */
		id?: string | undefined;
		/** Accessible name for the list. */
		label?: string | undefined;
		metLabel?: string | undefined;
		unmetLabel?: string | undefined;
		class?: string | undefined;
	}

	let {
		password,
		id,
		label = 'Password requirements',
		metLabel = 'Met',
		unmetLabel = 'Not met',
		class: className = ''
	}: Props = $props();

	const evaluated = $derived(evaluatePasswordCriteria(password));
</script>

<ul {id} class="password-criteria {className}" aria-label={label}>
	{#each evaluated as { criterion, met } (criterion.id)}
		<li class="password-criteria__item" class:password-criteria__item--met={met} data-met={met}>
			<!--
				The mark is decorative: the state is already in the text below it, so
				announcing it twice would just be noise.
			-->
			<span class="password-criteria__mark" aria-hidden="true">
				{#if met}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<path d="M20 6 9 17l-5-5" />
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="3"
						stroke-linecap="round"
					>
						<circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
					</svg>
				{/if}
			</span>
			<span class="password-criteria__label">{criterion.label}</span>
			<span class="password-criteria__state">{met ? metLabel : unmetLabel}</span>
		</li>
	{/each}
</ul>

<style>
	/*
	 * Scoped CSS over core's theme tokens, per this package's convention: a
	 * utility class here would be purged in a consumer app, and a hex literal
	 * would ignore the consumer's theme.
	 *
	 * There is no success token in core's palette, so a met criterion uses
	 * `--primary` rather than inventing a green that no theme can override.
	 */
	.password-criteria {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.password-criteria__item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
	}

	.password-criteria__item--met {
		color: hsl(var(--primary, 222.2 47.4% 11.2%));
	}

	.password-criteria__mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 0.875rem;
		height: 0.875rem;
		flex: none;
	}

	/* Visually hidden, still read on navigation. */
	.password-criteria__state {
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
</style>
