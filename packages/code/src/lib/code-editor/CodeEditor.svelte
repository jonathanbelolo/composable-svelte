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

	// Create reactive state that syncs with store
	let state = $state(store.state);

	// Editor DOM reference
	let editorElement: HTMLElement;
	let view: EditorView | null = null;

	// Track CodeMirror's internal value to prevent circular updates
	let codemirrorValue = $state('');

	// Subscribe to store changes
	onMount(() => {
		console.log('[CodeEditor Component] Subscribing to store');
		const unsubscribe = store.subscribe((newState) => {
			console.log('[CodeEditor Component] State updated from store');
			state = newState;
		});

		return unsubscribe;
	});

	// Initialize CodeMirror
	$effect(() => {
		if (editorElement && !view) {
			console.log('[CodeEditor] Initializing CodeMirror view');
			createEditorView(editorElement, store, {
				value: state.value,
				language: state.language,
				theme: state.theme,
				showLineNumbers: state.showLineNumbers,
				readOnly: state.readOnly,
				enableAutocomplete: state.enableAutocomplete,
				tabSize: state.tabSize
			}).then((editorView) => {
				view = editorView;
				codemirrorValue = state.value;
				console.log('[CodeEditor] CodeMirror view created');
			});

			return () => {
				console.log('[CodeEditor] Destroying CodeMirror view');
				view?.destroy();
				view = null;
			};
		}
		return undefined;
	});

	// Sync programmatic value updates (from store → CodeMirror)
	// This handles external changes like loading a file or formatting
	$effect(() => {
		if (view && state.value !== codemirrorValue) {
			console.log('[CodeEditor] Syncing external value change to CodeMirror');
			updateEditorValue(view, state.value);
			codemirrorValue = state.value;
		}
	});

	// Keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey) {
			if (e.key === 's') {
				e.preventDefault();
				store.dispatch({ type: 'save' });
			} else if (e.key === 'f' && e.shiftKey) {
				e.preventDefault();
				store.dispatch({ type: 'format' });
			}
		}
	}

	// Derived values
	const saveButtonText = $derived(state.hasUnsavedChanges ? 'Save *' : 'Save');
	const saveButtonDisabled = $derived(!state.hasUnsavedChanges);
</script>

<div class="code-editor" data-theme={state.theme}>
	{#if showToolbar}
		<div class="code-editor__toolbar">
			<div class="code-editor__toolbar-left">
				<select
					class="code-editor__select"
					value={state.language}
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
					Line Numbers: {state.showLineNumbers ? 'On' : 'Off'}
				</button>

				<button
					class="code-editor__button"
					onclick={() => store.dispatch({ type: 'themeChanged', theme: state.theme === 'dark' ? 'light' : 'dark' })}
					aria-label="Toggle theme"
				>
					Theme: {state.theme === 'dark' ? 'Dark' : 'Light'}
				</button>
			</div>

			<div class="code-editor__toolbar-right">
				<button
					class="code-editor__button"
					onclick={() => store.dispatch({ type: 'format' })}
					disabled={state.readOnly || state.formatError !== null}
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

	{#if state.saveError}
		<div class="code-editor__error">
			Save Error: {state.saveError}
		</div>
	{/if}

	{#if state.formatError}
		<div class="code-editor__error">
			Format Error: {state.formatError}
		</div>
	{/if}

	{#if state.error}
		<div class="code-editor__error">
			{state.error}
		</div>
	{/if}

	<div
		bind:this={editorElement}
		class="code-editor__container"
		onkeydown={handleKeyDown}
		role="textbox"
		tabindex="0"
		aria-label="Code editor"
		aria-multiline="true"
		aria-readonly={state.readOnly}
	></div>

	{#if state.cursorPosition}
		<div class="code-editor__status-bar">
			<span class="code-editor__status-item">
				Ln {state.cursorPosition.line}, Col {state.cursorPosition.column}
			</span>
			{#if state.selection}
				<span class="code-editor__status-item">
					{state.selection.text.length} chars selected
				</span>
			{/if}
			<span class="code-editor__status-item">
				{state.language}
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
