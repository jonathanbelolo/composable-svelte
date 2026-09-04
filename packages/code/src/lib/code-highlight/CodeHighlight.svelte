<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { CodeHighlightState, CodeHighlightAction } from './code-highlight.types.js';

	/**
	 * Store containing all component state
	 * NO component $state - all application state lives in the store
	 */
	const { store }: { store: Store<CodeHighlightState, CodeHighlightAction> } = $props();

	// Not $state: read and written by the effect below, and a reactive guard
	// re-triggers the effect it lives in. Seeded in onMount so `init` and the
	// effect do not both highlight on the first frame.
	let appliedCode: string | null = null;

	onMount(() => {
		appliedCode = store.state.code;

		// Keep the guard current for changes the store already knows about.
		// Without this the effect below sees an externally-dispatched
		// `codeChanged` as a change it did not cause and dispatches a SECOND one
		// — doubling the highlighter call, which for a network-backed highlighter
		// is a doubled request per edit.
		const unsubscribe = store.subscribeToActions?.((action) => {
			if (action.type === 'codeChanged') appliedCode = action.code;
		});

		store.dispatch({ type: 'init' });
		return () => unsubscribe?.();
	});

	/**
	 * Re-highlight when the code changes from outside.
	 *
	 * The component only dispatched `init` on mount, so a parent reducer scoped
	 * over this state could replace `code` without `codeChanged` ever running —
	 * leaving `highlightedCode` stale forever while the markup kept rendering it.
	 */
	$effect(() => {
		// Read first: an early return above this would leave the effect tracking
		// nothing and never re-running.
		//
		// This fires only for a `code` change the store did NOT learn about via
		// `codeChanged` — i.e. a parent reducer writing the field directly, which
		// is the stale-highlight case. Changes that came through `codeChanged`
		// have already moved `appliedCode` in the action subscription above.
		const code = $store.code;
		if (code === appliedCode) return;
		appliedCode = code;
		store.dispatch({ type: 'codeChanged', code });
	});

	// Use Svelte's auto-subscription pattern - ZERO boilerplate!
	const showCopyButton = $derived($store.code.length > 0);
	const copyButtonText = $derived(
		$store.copyStatus === 'copied'
			? 'Copied!'
			: $store.copyStatus === 'copying'
				? 'Copying...'
				: $store.copyStatus === 'failed'
					? 'Failed'
					: 'Copy'
	);
	const copyButtonDisabled = $derived($store.copyStatus === 'copying');

	/**
	 * One entry per rendered line, derived from the SOURCE — never from
	 * `highlightedCode`, which is HTML and would miscount.
	 */
	const lineCount = $derived(
		Math.max(1, $store.code.split('\n').length - ($store.code.endsWith('\n') ? 1 : 0))
	);
	const lineNumbers = $derived(
		Array.from({ length: lineCount }, (_, i) => $store.startLine + i)
	);
	/** Requested highlights, dropped if they fall outside the document. */
	const highlightedLines = $derived(
		$store.highlightLines.filter(
			(n) => n >= $store.startLine && n < $store.startLine + lineCount
		)
	);
</script>

<div class="code-highlight" data-theme={$store.theme}>
	{#if showCopyButton}
		<div class="code-highlight__toolbar">
			<button
				class="code-highlight__copy-button"
				onclick={() => store.dispatch({ type: 'copyCode' })}
				disabled={copyButtonDisabled}
				title={$store.copyError ?? undefined}
				aria-label="Copy code to clipboard"
			>
				{copyButtonText}
			</button>
		</div>
	{/if}

	{#if $store.isHighlighting}
		<div class="code-highlight__loading">Highlighting...</div>
	{:else if $store.error}
		<div class="code-highlight__error">{$store.error}</div>
	{/if}

	<pre
		class="code-highlight__pre language-{$store.language}"
		class:line-numbers={$store.showLineNumbers}
	>{#each highlightedLines as n (n)}<span
			class="code-highlight__line-highlight"
			style:top="calc({n - $store.startLine} * var(--chl-line-height))"
			aria-hidden="true"
		></span>{/each}{#if $store.showLineNumbers}<span
			class="code-highlight__line-numbers"
			aria-hidden="true"
		>{#each lineNumbers as n (n)}<span>{n}</span>{/each}</span
		>{/if}<code class="code-highlight__code"
		>{#if $store.highlightedCode}{@html $store.highlightedCode}{:else}{$store.code}{/if}</code
		></pre>
</div>

<style>
	.code-highlight {
		position: relative;
		font-family: 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
		font-size: 14px;
		line-height: 1.5;
		border-radius: 8px;
		overflow: hidden;
		background: #1e1e1e;
	}

	.code-highlight[data-theme='light'] {
		background: #f5f5f5;
	}

	.code-highlight__toolbar {
		display: flex;
		justify-content: flex-end;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.1);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.code-highlight[data-theme='light'] .code-highlight__toolbar {
		background: rgba(0, 0, 0, 0.02);
		border-bottom: 1px solid rgba(0, 0, 0, 0.1);
	}

	.code-highlight__copy-button {
		padding: 4px 12px;
		font-size: 12px;
		font-weight: 500;
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		cursor: pointer;
	}

	.code-highlight__copy-button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.code-highlight__copy-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.code-highlight[data-theme='light'] .code-highlight__copy-button {
		color: #333;
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.1);
	}

	.code-highlight[data-theme='light'] .code-highlight__copy-button:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.08);
		border-color: rgba(0, 0, 0, 0.15);
	}

	.code-highlight__loading,
	.code-highlight__error {
		padding: 12px;
		font-size: 13px;
		text-align: center;
	}

	.code-highlight__loading {
		color: #888;
	}

	.code-highlight__error {
		color: #ff6b6b;
		background: rgba(255, 107, 107, 0.1);
	}

	.code-highlight__pre {
		margin: 0;
		padding: 16px;
		overflow-x: auto;
		background: transparent;
	}

	.code-highlight__code {
		display: block;
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
		color: #d4d4d4;
	}

	.code-highlight[data-theme='light'] .code-highlight__code {
		color: #333;
	}

	/*
	 * Line numbers.
	 *
	 * Rendered as real spans, not CSS counters. `counter-increment` + `::before`
	 * lives only in the CSSOM, so `getComputedStyle(el, '::before').content`
	 * returns the literal `counter(...)` expression rather than the digits — no
	 * test can assert what the reader actually sees. The previous CSS reserved
	 * this 3.8em gutter and never filled it.
	 *
	 * `--chl-line-height` is declared here so the number column and the
	 * highlight bands cannot drift from the code's own line-height.
	 */
	.code-highlight__pre {
		--chl-line-height: 1.5em;
		position: relative;
	}

	.code-highlight__pre.line-numbers {
		padding-left: 3.8em;
	}

	.code-highlight__line-numbers {
		/*
		 * `sticky`, not `absolute`. The <pre> is `overflow-x: auto`, so an
		 * absolutely positioned gutter scrolls away with the content — the
		 * numbers slide out of view while the code keeps its 3.8em indent. Long
		 * lines are the normal case for code, so this was not an edge case.
		 * `sticky` pins the column to the scroll container's left edge.
		 */
		position: sticky;
		float: left;
		top: 0;
		left: 0;
		margin-left: -3.8em;
		width: 3.8em;
		padding-right: 1em;
		text-align: right;
		color: #858585;
		/* Keeps the numbers out of the clipboard; aria-hidden keeps them out of
		   the accessibility tree. Both are required — copying code and getting
		   line numbers back is worse than having none. */
		user-select: none;
		-webkit-user-select: none;
		pointer-events: none;
	}

	.code-highlight__line-numbers > span {
		display: block;
		line-height: var(--chl-line-height);
	}

	.code-highlight[data-theme='light'] .code-highlight__line-numbers {
		color: #999;
	}

	.code-highlight__line-highlight {
		/*
		 * `min-width: 100%` on a `max-content` box so a band spans the whole
		 * scrollable width, not just the first viewport of it. `right: 0` sized
		 * these to the client box, so a highlighted line stopped at the fold.
		 */
		position: absolute;
		left: 0;
		min-width: 100%;
		width: max-content;
		height: var(--chl-line-height);
		margin-top: 16px;
		background: rgba(255, 255, 255, 0.08);
		pointer-events: none;
	}

	.code-highlight[data-theme='light'] .code-highlight__line-highlight {
		background: rgba(0, 0, 0, 0.06);
	}

	.code-highlight__code {
		line-height: var(--chl-line-height);
	}

	.code-highlight__pre.line-numbers .code-highlight__code {
		position: relative;
		white-space: inherit;
	}

	.code-highlight__pre.line-numbers .code-highlight__code :global(> *) {
		position: relative;
		z-index: 1;
	}

	/* Basic syntax highlighting colors (dark theme) */
	.code-highlight :global(.token.comment),
	.code-highlight :global(.token.prolog),
	.code-highlight :global(.token.doctype),
	.code-highlight :global(.token.cdata) {
		color: #6a9955;
	}

	.code-highlight :global(.token.punctuation) {
		color: #d4d4d4;
	}

	.code-highlight :global(.token.property),
	.code-highlight :global(.token.tag),
	.code-highlight :global(.token.boolean),
	.code-highlight :global(.token.number),
	.code-highlight :global(.token.constant),
	.code-highlight :global(.token.symbol),
	.code-highlight :global(.token.deleted) {
		color: #b5cea8;
	}

	.code-highlight :global(.token.selector),
	.code-highlight :global(.token.attr-name),
	.code-highlight :global(.token.string),
	.code-highlight :global(.token.char),
	.code-highlight :global(.token.builtin),
	.code-highlight :global(.token.inserted) {
		color: #ce9178;
	}

	.code-highlight :global(.token.operator),
	.code-highlight :global(.token.entity),
	.code-highlight :global(.token.url) {
		color: #d4d4d4;
	}

	.code-highlight :global(.token.atrule),
	.code-highlight :global(.token.attr-value),
	.code-highlight :global(.token.keyword) {
		color: #c586c0;
	}

	.code-highlight :global(.token.function),
	.code-highlight :global(.token.class-name) {
		color: #dcdcaa;
	}

	.code-highlight :global(.token.regex),
	.code-highlight :global(.token.important),
	.code-highlight :global(.token.variable) {
		color: #d16969;
	}

	/* Light theme colors */
	.code-highlight[data-theme='light'] :global(.token.comment),
	.code-highlight[data-theme='light'] :global(.token.prolog),
	.code-highlight[data-theme='light'] :global(.token.doctype),
	.code-highlight[data-theme='light'] :global(.token.cdata) {
		color: #008000;
	}

	.code-highlight[data-theme='light'] :global(.token.property),
	.code-highlight[data-theme='light'] :global(.token.tag),
	.code-highlight[data-theme='light'] :global(.token.boolean),
	.code-highlight[data-theme='light'] :global(.token.number),
	.code-highlight[data-theme='light'] :global(.token.constant),
	.code-highlight[data-theme='light'] :global(.token.symbol) {
		color: #098658;
	}

	.code-highlight[data-theme='light'] :global(.token.selector),
	.code-highlight[data-theme='light'] :global(.token.attr-name),
	.code-highlight[data-theme='light'] :global(.token.string),
	.code-highlight[data-theme='light'] :global(.token.char),
	.code-highlight[data-theme='light'] :global(.token.builtin) {
		color: #a31515;
	}

	.code-highlight[data-theme='light'] :global(.token.atrule),
	.code-highlight[data-theme='light'] :global(.token.attr-value),
	.code-highlight[data-theme='light'] :global(.token.keyword) {
		color: #0000ff;
	}

	.code-highlight[data-theme='light'] :global(.token.function),
	.code-highlight[data-theme='light'] :global(.token.class-name) {
		color: #795e26;
	}
</style>
