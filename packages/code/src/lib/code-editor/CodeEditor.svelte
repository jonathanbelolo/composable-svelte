<script lang="ts">
	import { onMount } from 'svelte';
	import type { Store } from '@composable-svelte/core';
	import type { EditorView } from 'codemirror';
	import type {
		CodeEditorState,
		CodeEditorAction,
		SupportedLanguage
	} from './code-editor.types.js';
	import {
		createEditorView,
		updateEditorValue,
		updateEditorLanguage,
		updateEditorTheme,
		updateEditorReadOnly,
		updateTabSize,
		updateLineNumbers,
		updateFolding,
		updateAutocomplete
	} from './codemirror-wrapper.js';

	/**
	 * Store containing all component state
	 * NO component $state - all application state lives in the store
	 */
	const { store, showToolbar = true }: { store: Store<CodeEditorState, CodeEditorAction>; showToolbar?: boolean } = $props();

	// Editor DOM reference
	let editorElement: HTMLElement;
	let view: EditorView | null = null;

	// Track CodeMirror's internal value to prevent circular updates.
	//
	// Not $state: this is read AND written inside the effect below, which is the
	// shape that produces `effect_update_depth_exceeded`. It terminated only
	// because the write falsified its own condition. It is never read from the
	// template, so a plain `let` is both sufficient and safer.
	let codemirrorValue = '';

	// Not $state, for the same reason: the sync effect reads and writes these.
	// A reactive guard re-triggers the effect it lives in. Same pattern and same
	// rationale as `DropdownMenu.svelte` in core.
	let appliedLanguage: SupportedLanguage | null = null;
	let appliedTheme: 'light' | 'dark' | 'auto' | null = null;
	let appliedReadOnly: boolean | null = null;
	let appliedTabSize: number | null = null;
	let appliedShowLineNumbers: boolean | null = null;
	let appliedFolding: boolean | null = null;
	let appliedAutocomplete: boolean | null = null;

	/**
	 * Push store config into the live view, skipping anything already applied.
	 *
	 * Idempotent by value, and that is load-bearing rather than an optimisation:
	 * flipping `readOnly` while the editor has focus blurs `contentDOM`, the
	 * update listener sees `focusChanged` and dispatches `blurred` back into the
	 * store, which re-runs this effect. These guards are what make that second
	 * pass a no-op instead of a cycle. The same applies to the ~2 dispatches per
	 * keystroke.
	 */
	function syncConfig(
		editor: EditorView,
		language: SupportedLanguage,
		theme: 'light' | 'dark' | 'auto',
		readOnly: boolean,
		tabSize: number,
		showLineNumbers: boolean,
		enableFolding: boolean,
		enableAutocomplete: boolean
	): void {
		if (theme !== appliedTheme) {
			appliedTheme = theme;
			updateEditorTheme(editor, theme);
		}
		if (readOnly !== appliedReadOnly) {
			appliedReadOnly = readOnly;
			updateEditorReadOnly(editor, readOnly);
		}
		if (tabSize !== appliedTabSize) {
			appliedTabSize = tabSize;
			updateTabSize(editor, tabSize);
		}
		if (showLineNumbers !== appliedShowLineNumbers) {
			appliedShowLineNumbers = showLineNumbers;
			updateLineNumbers(editor, showLineNumbers);
		}
		if (enableFolding !== appliedFolding) {
			appliedFolding = enableFolding;
			updateFolding(editor, enableFolding);
		}
		if (enableAutocomplete !== appliedAutocomplete) {
			appliedAutocomplete = enableAutocomplete;
			updateAutocomplete(editor, enableAutocomplete);
		}
		if (language !== appliedLanguage) {
			appliedLanguage = language;
			// Stale-request guarded inside the wrapper.
			updateEditorLanguage(editor, language).catch(() => {
				// The dynamic import failed — a stale chunk after a deploy, or
				// offline. Without this the guard still reads "applied", so
				// re-selecting the same language is a permanent no-op and the
				// editor stays on the previous grammar with no way back. Clearing
				// it lets a retry actually retry. The `catch` also stops this
				// becoming an unhandled rejection.
				if (appliedLanguage === language) appliedLanguage = null;
			});
		}
	}

	// Initialize CodeMirror on mount
	onMount(() => {
		const initial = {
			value: $store.value,
			language: $store.language,
			theme: $store.theme,
			showLineNumbers: $store.showLineNumbers,
			readOnly: $store.readOnly,
			enableAutocomplete: $store.enableAutocomplete,
			enableFolding: $store.enableFolding,
			tabSize: $store.tabSize
		};

		createEditorView(editorElement, store, initial).then((editorView) => {
			view = editorView;
			// Record what CodeMirror actually received, not what the store says
			// by the time this promise resolves.
			codemirrorValue = initial.value;
			appliedLanguage = initial.language;
			appliedTheme = initial.theme;
			appliedReadOnly = initial.readOnly;
			appliedTabSize = initial.tabSize;
			appliedShowLineNumbers = initial.showLineNumbers;
			appliedFolding = initial.enableFolding;
			appliedAutocomplete = initial.enableAutocomplete;

			// Catch up on anything dispatched while the view was being built.
			// The effect below cannot do this: `view` is deliberately not
			// reactive, so its dependency set is the store scalars only and it
			// does not re-run when the view lands.
			const current = store.state;
			syncConfig(
				editorView,
				current.language,
				current.theme,
				current.readOnly,
				current.tabSize,
				current.showLineNumbers,
				current.enableFolding,
				current.enableAutocomplete
			);
			if (current.value !== codemirrorValue) {
				updateEditorValue(editorView, current.value);
				codemirrorValue = current.value;
			}
		});

		return () => {
			view?.destroy();
		};
	});

	// Sync programmatic value updates (from store → CodeMirror).
	// This handles external changes like loading a file or formatting.
	$effect(() => {
		// Read the store FIRST. This was `if (view && $store.value !== ...)`, and
		// `view` is a deliberately non-reactive `let` that is null on the effect's
		// first run because `createEditorView` is async. `&&` short-circuited
		// before `$store.value` was ever read, so the effect captured no
		// dependencies at all and never ran again — programmatic value changes,
		// including the whole format flow, never reached the editor.
		//
		// Exactly the hazard noted on the config effect below; this one had it in
		// `&&` form rather than early-`return` form and was missed.
		const nextValue = $store.value;

		if (view && nextValue !== codemirrorValue) {
			updateEditorValue(view, nextValue);
			codemirrorValue = nextValue;
		}
	});

	// Sync editor configuration (store -> CodeMirror).
	$effect(() => {
		// Read every tracked value first. An early `return` above these would
		// leave the effect depending only on `view`, which is deliberately not
		// reactive — and it would then never re-run.
		const language = $store.language;
		const theme = $store.theme;
		const readOnly = $store.readOnly;
		const tabSize = $store.tabSize;
		const showLineNumbers = $store.showLineNumbers;
		const enableFolding = $store.enableFolding;
		const enableAutocomplete = $store.enableAutocomplete;

		if (!view) return;
		syncConfig(
			view,
			language,
			theme,
			readOnly,
			tabSize,
			showLineNumbers,
			enableFolding,
			enableAutocomplete
		);
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
				<!--
					Disabled by read-only alone. It also used to disable on
					`formatError !== null`, which was a one-way trap: `formatError` is
					cleared inside `case 'format'` (code-editor.reducer.ts:156), and a
					disabled button can never dispatch `format` to reach it. One failed
					format killed the button for the session — and with no `formatter`
					dependency the very first click fails, which is exactly what the
					README's example configures. The error still shows in the banner below.
				-->
				<button
					class="code-editor__button"
					onclick={() => store.dispatch({ type: 'format' })}
					disabled={$store.readOnly}
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
