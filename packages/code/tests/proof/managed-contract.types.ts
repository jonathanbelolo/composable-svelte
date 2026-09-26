/**
 * B1 proof — type-level evidence, checked by `pnpm check` (svelte-check over
 * tsconfig.test.json). Never executed: not matched by the vitest include.
 *
 * Every `@ts-expect-error` below is a measured incompatibility; if one stops
 * erroring, svelte-check fails on the unused directive. No casts.
 */

import type { ComponentProps } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type { ChildView, FeatureViewProps } from '@composable-svelte/core/application';
import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
import { createEditorView } from '../../src/lib/code-editor/codemirror-wrapper';
import type { CodeEditorAction, CodeEditorState } from '../../src/lib/code-editor/code-editor.types';
import type { CommandQueueSource } from './command-queue';
import type { EditorCommand, ProofEditorAction, ProofEditorState } from './editor-command-queue';

declare const managed: ChildView<CodeEditorState, CodeEditorAction>;
declare const proofView: ChildView<ProofEditorState, ProofEditorAction>;
declare const proofProps: FeatureViewProps<ProofEditorState, ProofEditorAction>;
declare const standalone: Store<CodeEditorState, CodeEditorAction>;
declare const parent: HTMLElement;

const config = {
	value: '',
	language: 'javascript',
	theme: 'dark',
	showLineNumbers: true,
	readOnly: false,
	enableAutocomplete: false,
	enableFolding: false,
	tabSize: 2
} as const;

// ---- Shipped surface vs. a managed view (baseline, unchanged) ----

// @ts-expect-error ChildView has no action stream: the shipped command path cannot subscribe.
export const actionStream = managed.subscribeToActions;

// Migrated (CODE-MIGRATION.md): the shipped CodeEditor now takes a managed view
// as well as a standalone Store. Before, this line needed @ts-expect-error.
export const shippedProps: ComponentProps<typeof CodeEditor> = { store: managed };
export const shippedStandaloneProps: ComponentProps<typeof CodeEditor> = { store: standalone };

// ---- Package-only change: createEditorView takes Pick<Store, 'dispatch'> ----

export const createdManaged = createEditorView(parent, managed, config);
export const createdStandalone = createEditorView(parent, standalone, config);

// ---- Option A: satisfied by the existing public contract, without casts ----

export const source: CommandQueueSource<ProofEditorState, EditorCommand> = proofView;
export const fromProps: CommandQueueSource<ProofEditorState, EditorCommand> = proofProps.store;

// A ChildView is not a Store; Option A never needs it to be.
// @ts-expect-error
export const notAStore: Store<ProofEditorState, ProofEditorAction> = proofView;

// Option B was productionized as `observeChildActions` / `isManagedChildView`
// in `@composable-svelte/core/application`. Its type evidence is now the
// package's own `tests/managed/managed-surface.types.ts`, against the built
// core declarations; the experimental slice and its source alias were removed.
