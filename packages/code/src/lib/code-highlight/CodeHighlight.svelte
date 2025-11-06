<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { CodeHighlightState, CodeHighlightAction } from './code-highlight.types';

	/**
	 * Store containing all component state
	 * NO component $state - all application state lives in the store
	 */
	const { store }: { store: Store<CodeHighlightState, CodeHighlightAction> } = $props();

	// Create reactive state that syncs with store
	let state = $state(store.state);

	// Subscribe to store changes
	onMount(() => {
		console.log('[CodeHighlight Component] Subscribing to store');
		const unsubscribe = store.subscribe((newState) => {
			console.log('[CodeHighlight Component] State updated from store');
			state = newState;
		});

		console.log('[CodeHighlight Component] Dispatching init action');
		store.dispatch({ type: 'init' });

		return unsubscribe;
	});

	// Derived values only (NO $state)
	const showCopyButton = $derived(state.code.length > 0);
	const copyButtonText = $derived(
		state.copyStatus === 'copied'
			? 'Copied!'
			: state.copyStatus === 'copying'
				? 'Copying...'
				: 'Copy'
	);
	const copyButtonDisabled = $derived(state.copyStatus === 'copying');
</script>

<div class="code-highlight" data-theme={state.theme}>
	{#if showCopyButton}
		<div class="code-highlight__toolbar">
			<button
				class="code-highlight__copy-button"
				onclick={() => store.dispatch({ type: 'copyCode' })}
				disabled={copyButtonDisabled}
				aria-label="Copy code to clipboard"
			>
				{copyButtonText}
			</button>
		</div>
	{/if}

	{#if state.isHighlighting}
		<div class="code-highlight__loading">Highlighting...</div>
	{:else if state.error}
		<div class="code-highlight__error">{state.error}</div>
	{/if}

	<pre
		class="code-highlight__pre language-{state.language}"
		class:line-numbers={state.showLineNumbers}
		style:counter-reset={state.showLineNumbers ? `line-number ${state.startLine - 1}` : undefined}
	><code class="code-highlight__code">{@html state.highlightedCode || state.code}</code></pre>
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
		transition: all 0.2s;
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

	/* Line numbers */
	.code-highlight__pre.line-numbers {
		padding-left: 3.8em;
		counter-reset: linenumber;
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
