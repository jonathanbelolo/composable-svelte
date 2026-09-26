<script lang="ts">
	/**
	 * B1 proof, Option A render component: the shipped `createEditorView` (full
	 * extension set, language loading, compartments) driven through a managed
	 * `ChildView` by the state-carried command queue. No `subscribeToActions`,
	 * no root store, no casts. `createEditorView` accepts the view because its
	 * parameter was narrowed to `Pick<Store, 'dispatch'>` (package-only change).
	 */
	import { onMount, untrack } from 'svelte';
	import type { EditorView } from '@codemirror/view';
	import type { FeatureViewProps } from '@composable-svelte/core/application';
	import { createEditorView, runEditorCommand, updateEditorValue } from '../../src/lib/code-editor/codemirror-wrapper';
	import { bindCommandQueue } from './command-queue';
	import type { CodeEditorAction } from '../../src/lib/code-editor/code-editor.types';
	import type { ProofEditorAction, ProofEditorState } from './editor-command-queue';
	import { captured, creationGate, log, nextAttachment, proofConfig } from './proof-model';

	let { store, surface }: FeatureViewProps<ProofEditorState, ProofEditorAction> = $props();

	// Captured once: acks and edits go to this owner, never to a successor.
	const owner = untrack(() => store);
	const label = untrack(() => store.state?.label ?? 'retired');
	const name = nextAttachment(label);
	const options = proofConfig.options;
	captured.push(owner);

	let host: HTMLElement;

	onMount(() => {
		log.push(`mount:${name}`);
		let editor: EditorView | null = null;
		let appliedValue: string | null = null;
		let writing = false;
		// Programmatic writes from state are not user edits: do not echo them back.
		const sink = {
			dispatch(action: CodeEditorAction) {
				if (writing && action.type === 'valueChanged') return;
				owner.dispatch(action);
			}
		};
		const binding = bindCommandQueue(owner, (state) => state.commands, {
			...options,
			// State-driven value writes land before any command of a later turn.
			beforeCommands: (state) => {
				if (!editor || state.value === appliedValue) return;
				appliedValue = state.value;
				writing = true;
				try {
					updateEditorValue(editor, state.value);
				} finally {
					writing = false;
				}
			}
		});
		let alive = true;

		const create = async () => {
			await (creationGate.hold ?? Promise.resolve());
			const initial = owner.state;
			if (!alive || !initial) {
				log.push(`abandoned:${name}`);
				return;
			}
			const created = await createEditorView(host, sink, {
				value: initial.value,
				language: initial.language,
				theme: initial.theme,
				showLineNumbers: initial.showLineNumbers,
				readOnly: initial.readOnly,
				enableAutocomplete: initial.enableAutocomplete,
				enableFolding: initial.enableFolding,
				tabSize: initial.tabSize
			});
			if (!alive) {
				created.destroy();
				log.push(`abandoned:${name}`);
				return;
			}
			editor = created;
			appliedValue = initial.value;
			log.push(`attach:${name}`);
			binding.attach((command, entry) => {
				log.push(`exec:${name}:${entry.id}:${command.type}${command.type === 'insertText' ? `:${command.text}` : ''}`);
				runEditorCommand(created, command);
			});
		};
		void create();

		return () => {
			alive = false;
			binding.dispose();
			editor?.destroy();
			log.push(`destroy:${name}`);
		};
	});
</script>

<section use:surface data-proof-editor={label} data-attachment={name}>
	<div bind:this={host}></div>
</section>
