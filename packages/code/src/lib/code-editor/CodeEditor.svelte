<script lang="ts">
	import { onMount, untrack } from 'svelte';
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
		updateAutocomplete,
		runEditorCommand,
		restoreEditorValue
	} from './codemirror-wrapper.js';
	import {
		bindViewSource,
		observesActions,
		warnStoreReplaced,
		type ViewSource
	} from '../internal/view-source.js';

	type ValueReport = Extract<CodeEditorAction, { type: 'valueChanged' }>;

	const {
		store,
		showToolbar = true,
		autofocus = false
	}: {
		/**
		 * Either a standalone `Store` or a managed view: a `FeatureViewProps`
		 * store, or the result of `scopeTo` / `composition.bind`. It is bound
		 * once, at mount. `FeatureViews` and `FeatureOutlet` remount per owner;
		 * a hand-bound view needs `{#key view}`.
		 */
		store: ViewSource<CodeEditorState, CodeEditorAction>;
		showToolbar?: boolean | undefined;
		/**
		 * Focus the editor once it has been created.
		 *
		 * Durable configuration rather than a command: a `focus` dispatched
		 * before the asynchronous editor exists is dropped, and that includes
		 * one dispatched in the same turn that creates this editor's owner.
		 */
		autofocus?: boolean | undefined;
	} = $props();

	// The engine, its subscriptions and the markup all serve this one store.
	const source = untrack(() => store);
	let warnedReplaced = false;
	$effect(() => {
		if (store !== source && !warnedReplaced) {
			warnedReplaced = true;
			warnStoreReplaced('CodeEditor');
		}
	});

	// A managed view reads `undefined` once its owner retires, which can land
	// before the outlet unmounts this component. Keep showing the last
	// committed state rather than crash on it. Not $state: written only here.
	let retained: CodeEditorState | undefined = untrack(() => source.state);
	const current = $derived.by(() => {
		const next = $source;
		if (next !== undefined) retained = next;
		return retained;
	});

	// Editor DOM reference
	let editorElement: HTMLElement | undefined = $state();
	let view: EditorView | null = null;

	// What the live view was last brought to. Plain `let`s, not $state: they are
	// read and written by the synchronous state listener, and nothing renders
	// them.
	let appliedValue: string | null = null;
	let appliedRevision = 0;
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
	 * store, which notifies the state listener again. These guards, each set
	 * BEFORE its update, are what make that second pass a no-op instead of a
	 * cycle. The same applies to the ~2 dispatches per keystroke.
	 */
	function syncConfig(editor: EditorView, state: CodeEditorState): void {
		const { language, theme, readOnly, tabSize, showLineNumbers, enableFolding, enableAutocomplete } = state;
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
			updateEditorLanguage(editor, language).catch((e: unknown) => {
				if (!mounted) return;
				// Surface it. This used to reset the guard and drop the reason,
				// which is why `state.error` had no writer and its banner was
				// unreachable markup. A retired managed view drops this dispatch.
				source.dispatch({
					type: 'languageLoadFailed',
					language,
					error: e instanceof Error ? e.message : String(e)
				});
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

	/**
	 * This editor's reports that state has not answered yet, oldest first, with
	 * the value each carries and the `valueRevision` state reaches if it is
	 * accepted.
	 *
	 * A managed store queues a report made during a drain, so several can be
	 * in flight while state still holds an older value. That older value is
	 * the editor's own past, not an external write: writing it back would
	 * rewind the document and start a ping-pong with the queued reports.
	 *
	 * An entry leaves when its report is reduced: `reconcile` removes an
	 * accepted one, `settle` a declined one, and an external write clears them
	 * all. The bound only matters for a burst of more reports than this in one
	 * drain. The oldest is then forgotten, so its echo reads as an external
	 * write: the document is rewound to it, with an undo entry, and the queued
	 * reports replay one replacement at a time. It converges on state.
	 */
	const inFlight: Array<{ report: ValueReport; value: string; revision: number }> = [];
	const MAX_IN_FLIGHT = 256;
	/** True while the editor applies state; that change is not an edit. */
	let writing = false;
	/**
	 * Whether this store tells the component which actions it reduced. A
	 * standalone `Store` without `subscribeToActions` does not, but it reduces
	 * synchronously, so a report has been answered once `dispatch` returns.
	 */
	const hearsActions = observesActions(source);

	/**
	 * The editor's dispatch target. It stamps each edit report with the
	 * revision it expects state to be at, and records it. The report of a write
	 * this component made from state is not sent: the reducer would only
	 * discard it as stale, and sending it costs a turn per load.
	 */
	const sink = {
		dispatch(action: CodeEditorAction): void {
			if (action.type !== 'valueChanged') {
				source.dispatch(action);
				return;
			}
			if (writing) return;
			const baseRevision = inFlight[inFlight.length - 1]?.revision ?? appliedRevision;
			const report: ValueReport = { ...action, baseRevision };
			inFlight.push({ report, value: report.value, revision: baseRevision + 1 });
			if (inFlight.length > MAX_IN_FLIGHT) inFlight.shift();
			source.dispatch(report);
			if (!hearsActions) settle(report);
		}
	};

	/**
	 * Bring the live view to `state`: configuration, then the document.
	 *
	 * Runs synchronously from the store's state listener, which both store
	 * kinds notify before any action of the same turn. So a value or setting
	 * reduced before a command is in the editor when the command runs — a
	 * loaded file before an `insertText`, `setReadOnly(false)` before an edit.
	 * It used to run in `$effect`s, after the command.
	 *
	 * A value and revision this editor reported is its own echo arriving: the
	 * document is already there or further on, so it is left alone. Anything
	 * else is an external write, including one that restores the text an
	 * in-flight report was edited from: its revision differs. It replaces the
	 * document, and the reports still queued behind it are stale: they name a
	 * revision the write replaced, so the reducer drops them.
	 *
	 * A reducer that keeps no revision leaves it unchanged; the value alone
	 * then decides, as it did before revisions existed.
	 */
	function reconcile(editor: EditorView, state: CodeEditorState, addToHistory: boolean): void {
		syncConfig(editor, state);
		const value = state.value;
		const revision = state.valueRevision ?? 0;
		if (value === appliedValue && revision === appliedRevision) return;
		const unrevised = revision === appliedRevision;
		appliedValue = value;
		appliedRevision = revision;
		const own = inFlight.findIndex(
			(entry) => entry.value === value && (unrevised || entry.revision === revision)
		);
		if (own !== -1) {
			inFlight.splice(0, own + 1);
			return;
		}
		inFlight.length = 0;
		if (editor.state.doc.toString() === value) return;
		writing = true;
		try {
			updateEditorValue(editor, value, { addToHistory });
		} finally {
			writing = false;
		}
	}

	/**
	 * One of this editor's reports has been reduced.
	 *
	 * If state took it, `reconcile` has already matched and removed it. If it
	 * is still recorded, state declined it: a parent reducer vetoed the edit, or
	 * the report was stale. The document then shows text state does not hold,
	 * so it goes back to `state.value`, visibly, and Save saves what is shown.
	 * The reports queued behind it were edited on top of the declined text; the
	 * reducer drops them as stale, so they are forgotten here too.
	 */
	function settle(report: ValueReport): void {
		const index = inFlight.findIndex((entry) => entry.report === report || sameReport(entry.report, report));
		if (index === -1) return;
		inFlight.length = 0;
		const state = source.state;
		if (!state || !view) return;
		writing = true;
		try {
			restoreEditorValue(view, state.value);
		} finally {
			writing = false;
		}
	}

	/** A slot whose unwrap copies the action still delivers the same report. */
	const sameReport = (a: ValueReport, b: ValueReport): boolean =>
		a.value === b.value && a.baseValue === b.baseValue && a.baseRevision === b.baseRevision;

	/** Performs a command action against the live view, if there is one. */
	function runCommand(action: CodeEditorAction): void {
		// Before the asynchronous view exists, a command is dropped: nothing is
		// buffered or replayed. Durable setup belongs in state or props.
		if (!view) return;
		switch (action.type) {
			case 'undo':
			case 'redo':
			case 'selectAll':
			case 'deleteSelection':
			case 'focus':
			case 'blur':
			case 'insertText':
				runEditorCommand(view, action);
				return;
		}
	}

	let mounted = false;

	onMount(() => {
		mounted = true;
		const initial = source.state ?? retained;
		// Nothing to build from: the owner retired before this mounted.
		if (!initial || !editorElement) {
			mounted = false;
			return;
		}

		// Command actions reach the editor here, synchronously, once per
		// action: the managed owner's observed actions, or a standalone store's
		// `subscribeToActions`. An `$effect` would coalesce two commands of one
		// tick into one. Subscribed before the view exists; see `runCommand`.
		const unbind = bindViewSource(
			source,
			{
				component: 'CodeEditor',
				loses: 'undo / redo / insertText / deleteSelection / selectAll / focus / blur cannot reach the editor'
			},
			{
				onState: (state) => {
					// `undefined`: the managed owner retired. Leave the editor alone.
					if (state && view) reconcile(view, state, true);
				},
				onAction: (action) => {
					if (action.type === 'valueChanged') settle(action);
					else runCommand(action);
				}
			}
		);

		createEditorView(editorElement, sink, initial)
			.then((editorView) => {
				if (!mounted) {
					editorView.destroy();
					return;
				}
				view = editorView;
				// Record what CodeMirror actually received, not what the store says
				// by the time this promise resolves.
				appliedValue = initial.value;
				appliedRevision = initial.valueRevision ?? 0;
				appliedLanguage = initial.language;
				appliedTheme = initial.theme;
				appliedReadOnly = initial.readOnly;
				appliedTabSize = initial.tabSize;
				appliedShowLineNumbers = initial.showLineNumbers;
				appliedFolding = initial.enableFolding;
				appliedAutocomplete = initial.enableAutocomplete;

				// Catch up on anything reduced while the view was being built.
				// Not undoable: this is the editor catching up to state it was
				// built from, not an edit. Without this the editor opens with Undo
				// already enabled and one press wipes the seeded content.
				const latest = source.state;
				if (latest) reconcile(editorView, latest, false);
				if (autofocus) editorView.focus();
			})
			.catch((error: unknown) => {
				if (!mounted) return;
				source.dispatch({
					type: 'languageLoadFailed',
					language: initial.language,
					error: error instanceof Error ? error.message : String(error)
				});
			});

		return () => {
			mounted = false;
			unbind();
			view?.destroy();
			view = null;
		};
	});

	const saveButtonText = $derived(current?.hasUnsavedChanges ? 'Save *' : 'Save');
	const saveButtonDisabled = $derived(!current?.hasUnsavedChanges);
</script>

{#if current}
<div
	class="code-editor"
	class:code-editor--focused={current.isFocused}
	data-theme={current.theme}
>
	{#if showToolbar}
		<div class="code-editor__toolbar">
			<div class="code-editor__toolbar-left">
				<select
					class="code-editor__select"
					value={current.language}
					onchange={(e) => source.dispatch({ type: 'languageChanged', language: e.currentTarget.value as SupportedLanguage })}
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
					onclick={() => source.dispatch({ type: 'undo' })}
					disabled={!current.canUndo}
					aria-label="Undo"
				>
					Undo
				</button>

				<button
					class="code-editor__button"
					onclick={() => source.dispatch({ type: 'redo' })}
					disabled={!current.canRedo}
					aria-label="Redo"
				>
					Redo
				</button>

				<button
					class="code-editor__button"
					onclick={() => source.dispatch({ type: 'toggleLineNumbers' })}
					aria-label="Toggle line numbers"
				>
					Line Numbers: {current.showLineNumbers ? 'On' : 'Off'}
				</button>

				<button
					class="code-editor__button"
					onclick={() => source.dispatch({ type: 'themeChanged', theme: current.theme === 'dark' ? 'light' : 'dark' })}
					aria-label="Toggle theme"
				>
					Theme: {current.theme === 'dark' ? 'Dark' : 'Light'}
				</button>
			</div>

			<div class="code-editor__toolbar-right">
				<!--
					Disabled by read-only alone. It also used to disable on
					`formatError !== null`, which was a one-way trap: `formatError` is
					cleared inside `case 'format'` (code-editor.reducer.ts), and a
					disabled button can never dispatch `format` to reach it. One failed
					format killed the button for the session — and with no `formatter`
					dependency the very first click fails, which is exactly what the
					README's example configures. The error still shows in the banner below.
				-->
				<button
					class="code-editor__button"
					onclick={() => source.dispatch({ type: 'format' })}
					disabled={current.readOnly}
					aria-label="Format code"
				>
					Format
				</button>

				<button
					class="code-editor__button code-editor__button--primary"
					onclick={() => source.dispatch({ type: 'save' })}
					disabled={saveButtonDisabled}
					aria-label="Save code"
				>
					{saveButtonText}
				</button>
			</div>
		</div>
	{/if}

	{#if current.saveError}
		<div class="code-editor__error">
			Save Error: {current.saveError}
		</div>
	{/if}

	{#if current.formatError}
		<div class="code-editor__error">
			Format Error: {current.formatError}
		</div>
	{/if}

	{#if current.error}
		<div class="code-editor__error">
			{current.error}
		</div>
	{/if}

	<div
		bind:this={editorElement}
		class="code-editor__container"
	></div>

	{#if current.cursorPosition}
		<div class="code-editor__status-bar">
			<span class="code-editor__status-item">
				Ln {current.cursorPosition.line}, Col {current.cursorPosition.column}
			</span>
			{#if current.selection}
				<span class="code-editor__status-item">
					{current.selection.text.length} chars selected
				</span>
			{/if}
			<span class="code-editor__status-item">
				{current.language}
			</span>
		</div>
	{/if}
</div>
{/if}

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

	/*
	 * Specificity matters here, not just presence. `.code-editor--focused` is
	 * (0,1,0) while `.code-editor[data-theme='light']` is (0,2,0) and always
	 * matches — `data-theme` is unconditional on the root — so the plain class
	 * lost every contest in the light theme and painted nothing. Matching on the
	 * attribute too puts both selectors at (0,2,0), and the later rule wins.
	 */
	.code-editor[data-theme].code-editor--focused {
		border-color: #007acc;
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
