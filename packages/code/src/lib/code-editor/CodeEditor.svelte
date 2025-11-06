<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { EditorView } from 'codemirror';
	import type { CodeEditorState, CodeEditorAction } from './code-editor.types';
	import { createEditorView, updateEditorValue } from './codemirror-wrapper';

	/**
	 * Store containing all component state
	 * NO component $state - all application state lives in the store
	 */
	const { store, showToolbar = true }: { store: Store<CodeEditorState, CodeEditorAction>; showToolbar?: boolean } = $props();

	// Editor DOM reference
	let editorElement: HTMLElement;
	let view: EditorView | null = null;

	// Track CodeMirror's internal value to prevent circular updates
	let codemirrorValue = $state('');

	// Initialize CodeMirror on mount
	onMount(() => {
		console.log('[CodeEditor] Initializing CodeMirror view');
		createEditorView(editorElement, store, {
			value: $store.value,
			language: $store.language,
			theme: $store.theme,
			showLineNumbers: $store.showLineNumbers,
			readOnly: $store.readOnly,
			enableAutocomplete: $store.enableAutocomplete,
			tabSize: $store.tabSize
		}).then((editorView) => {
			view = editorView;
			codemirrorValue = $store.value;
			console.log('[CodeEditor] CodeMirror view created');
		});

		return () => {
			console.log('[CodeEditor] Destroying CodeMirror view');
			view?.destroy();
		};
	});

	// Sync programmatic value updates (from store → CodeMirror)
	// This handles external changes like loading a file or formatting
	$effect(() => {
		if (view && $store.value !== codemirrorValue) {
			console.log('[CodeEditor] Syncing external value change to CodeMirror');
			updateEditorValue(view, $store.value);
			codemirrorValue = $store.value;
		}
	});

	// Use Svelte's auto-subscription pattern - ZERO boilerplate!
	const saveButtonText = $derived($store.hasUnsavedChanges ? 'Save *' : 'Save');
	const saveButtonDisabled = $derived(!$store.hasUnsavedChanges);
</script>

<div class="code-editor" data-theme={$store.theme}>
	{#if showToolbar}
		<div class="code-editor__toolbar">
			<div class="code-editor__toolbar-left">
				<select
					class="code-editor__select"
					value={$store.language}
					onchange={(e) => store.dispatch({ type: 'languageChanged', language: e.currentTarget.value as any })}
					aria-label="Select programming language"
				>
					<option value="typescript">TypeScript</option>
					<option value="javascript">JavaScript</option>
					<option value="svelte">Svelte</option>
					<option value="html">HTML</option>
					<option value="css">CSS</option>
					<option value="json">JSON</option>
					<option value="markdown">Markdown</option>
					<option value="bash">Bash</option>
					<option value="sql">SQL</option>
					<option value="python">Python</option>
					<option value="rust">Rust</option>
				</select>

				<button
					class="code-editor__button"
					onclick={() => store.dispatch({ type: 'toggleLineNumbers' })}
					aria-label="Toggle line numbers"
				>
					Line Numbers: {$store.showLineNumbers ? 'On' : 'Off'}
				</button>

				<button
					class="code-editor__button"
					onclick={() => store.dispatch({ type: 'themeChanged', theme: $store.theme === 'dark' ? 'light' : 'dark' })}
					aria-label="Toggle theme"
				>
					Theme: {$store.theme === 'dark' ? 'Dark' : 'Light'}
				</button>
			</div>

			<div class="code-editor__toolbar-right">
				<button
					class="code-editor__button"
					onclick={() => store.dispatch({ type: 'format' })}
					disabled={$store.readOnly || $store.formatError !== null}
					aria-label="Format code"
				>
					Format
				</button>

				<button
					class="code-editor__button code-editor__button--primary"
					onclick={() => store.dispatch({ type: 'save' })}
					disabled={saveButtonDisabled}
					aria-label="Save code"
				>
					{saveButtonText}
				</button>
			</div>
		</div>
	{/if}

	{#if $store.saveError}
		<div class="code-editor__error">
			Save Error: {$store.saveError}
		</div>
	{/if}

	{#if $store.formatError}
		<div class="code-editor__error">
			Format Error: {$store.formatError}
		</div>
	{/if}

	{#if $store.error}
		<div class="code-editor__error">
			{$store.error}
		</div>
	{/if}

	<div
		bind:this={editorElement}
		class="code-editor__container"
	></div>

	{#if $store.cursorPosition}
		<div class="code-editor__status-bar">
			<span class="code-editor__status-item">
				Ln {$store.cursorPosition.line}, Col {$store.cursorPosition.column}
			</span>
			{#if $store.selection}
				<span class="code-editor__status-item">
					{$store.selection.text.length} chars selected
				</span>
			{/if}
			<span class="code-editor__status-item">
				{$store.language}
			</span>
		</div>
	{/if}
</div>

<style>
	.code-editor {
		display: flex;
		flex-direction: column;
		height: 100%;
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 8px;
		overflow: hidden;
		background: #1e1e1e;
		font-family: 'Fira Code', 'Consolas', 'Monaco', 'Courier New', monospace;
	}

	.code-editor[data-theme='light'] {
		background: #ffffff;
		border-color: rgba(0, 0, 0, 0.2);
	}

	.code-editor__toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.2);
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
		gap: 8px;
	}

	.code-editor[data-theme='light'] .code-editor__toolbar {
		background: rgba(0, 0, 0, 0.03);
		border-bottom-color: rgba(0, 0, 0, 0.1);
	}

	.code-editor__toolbar-left,
	.code-editor__toolbar-right {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.code-editor__select {
		padding: 4px 8px;
		font-size: 13px;
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.code-editor__select:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.code-editor[data-theme='light'] .code-editor__select {
		color: #333;
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.1);
	}

	.code-editor[data-theme='light'] .code-editor__select:hover {
		background: rgba(0, 0, 0, 0.08);
	}

	.code-editor__button {
		padding: 4px 12px;
		font-size: 13px;
		font-weight: 500;
		color: #fff;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
	}

	.code-editor__button:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.code-editor__button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.code-editor__button--primary {
		background: rgba(66, 133, 244, 0.8);
		border-color: rgba(66, 133, 244, 1);
	}

	.code-editor__button--primary:hover:not(:disabled) {
		background: rgba(66, 133, 244, 1);
	}

	.code-editor[data-theme='light'] .code-editor__button {
		color: #333;
		background: rgba(0, 0, 0, 0.05);
		border-color: rgba(0, 0, 0, 0.1);
	}

	.code-editor[data-theme='light'] .code-editor__button:hover:not(:disabled) {
		background: rgba(0, 0, 0, 0.08);
		border-color: rgba(0, 0, 0, 0.15);
	}

	.code-editor[data-theme='light'] .code-editor__button--primary {
		color: #fff;
		background: rgba(66, 133, 244, 0.9);
		border-color: rgba(66, 133, 244, 1);
	}

	.code-editor__error {
		padding: 8px 12px;
		font-size: 13px;
		color: #ff6b6b;
		background: rgba(255, 107, 107, 0.1);
		border-bottom: 1px solid rgba(255, 107, 107, 0.2);
	}

	.code-editor__container {
		flex: 1;
		overflow: auto;
		min-height: 200px;
	}

	.code-editor__status-bar {
		display: flex;
		gap: 16px;
		padding: 4px 12px;
		font-size: 12px;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(0, 0, 0, 0.2);
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.code-editor[data-theme='light'] .code-editor__status-bar {
		color: rgba(0, 0, 0, 0.6);
		background: rgba(0, 0, 0, 0.03);
		border-top-color: rgba(0, 0, 0, 0.1);
	}

	.code-editor__status-item {
		white-space: nowrap;
	}

	/* Make CodeMirror fill container */
	.code-editor__container :global(.cm-editor) {
		height: 100%;
	}

	.code-editor__container :global(.cm-scroller) {
		overflow: auto;
	}
</style>
