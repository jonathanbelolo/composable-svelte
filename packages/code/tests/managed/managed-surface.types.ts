/**
 * Type-level contract of the migrated components, checked by `pnpm check`
 * (svelte-check over tsconfig.test.json) against the BUILT core declarations:
 * `@composable-svelte/core` and `/application` resolve to `dist` through the
 * workspace link. No ambient mirror, no source alias. Never executed.
 *
 * Every `@ts-expect-error` is a measured rejection; if one stops erroring,
 * svelte-check fails on the unused directive.
 */
import type { ComponentProps } from 'svelte';
import type { Store } from '@composable-svelte/core';
import type {
	ApplicationStore,
	ChildView,
	FeatureViewProps,
	PresentationFeatureViewProps
} from '@composable-svelte/core/application';
import CodeEditor from '../../src/lib/code-editor/CodeEditor.svelte';
import CodeHighlight from '../../src/lib/code-highlight/CodeHighlight.svelte';
import NodeCanvas from '../../src/lib/node-canvas/NodeCanvas.svelte';
import type { CodeEditorAction, CodeEditorState } from '../../src/lib/code-editor/code-editor.types';
import type { CodeHighlightAction, CodeHighlightState } from '../../src/lib/code-highlight/code-highlight.types';
import type { NodeCanvasAction, NodeCanvasState } from '../../src/lib/node-canvas/types';

declare const editorView: ChildView<CodeEditorState, CodeEditorAction>;
declare const editorProps: FeatureViewProps<CodeEditorState, CodeEditorAction>;
declare const editorPanel: PresentationFeatureViewProps<CodeEditorState, CodeEditorAction>;
declare const editorStore: Store<CodeEditorState, CodeEditorAction>;
declare const editorApp: ApplicationStore<CodeEditorState, CodeEditorAction>;
declare const highlightView: ChildView<CodeHighlightState, CodeHighlightAction>;
declare const canvasView: ChildView<NodeCanvasState, NodeCanvasAction>;
declare const canvasStore: Store<NodeCanvasState, NodeCanvasAction>;
type Parent = { type: 'canvas'; action: NodeCanvasAction } | { type: 'zoomIn' };
declare const wrappingStore: Store<NodeCanvasState, Parent>;

// ---- CodeEditor: a managed view, a presentation view or a standalone Store ----
export const e1: ComponentProps<typeof CodeEditor> = { store: editorView };
export const e2: ComponentProps<typeof CodeEditor> = { store: editorProps.store };
export const e3: ComponentProps<typeof CodeEditor> = { store: editorPanel.store, autofocus: true };
export const e4: ComponentProps<typeof CodeEditor> = { store: editorStore, showToolbar: false };
// Type-valid, and warned about at runtime: an ApplicationStore is not a captured view.
export const e5: ComponentProps<typeof CodeEditor> = { store: editorApp };
// @ts-expect-error Another feature's view is not an editor's store.
export const e6: ComponentProps<typeof CodeEditor> = { store: highlightView };

// ---- CodeHighlight ----
export const h1: ComponentProps<typeof CodeHighlight> = { store: highlightView };
// @ts-expect-error An editor view is not a highlight store.
export const h2: ComponentProps<typeof CodeHighlight> = { store: editorView };

// ---- NodeCanvas: liftAction is optional only when the store's action IS the canvas action ----
export const n1: ComponentProps<typeof NodeCanvas<Record<string, unknown>, Record<string, unknown>, NodeCanvasAction>> = {
	store: canvasView
};
export const n2: ComponentProps<typeof NodeCanvas<Record<string, unknown>, Record<string, unknown>, NodeCanvasAction>> = {
	store: canvasStore
};
export const n3: ComponentProps<typeof NodeCanvas<Record<string, unknown>, Record<string, unknown>, Parent>> = {
	store: wrappingStore,
	liftAction: (action) => ({ type: 'canvas', action }),
	unliftAction: (action) => (action.type === 'canvas' ? action.action : null)
};
// @ts-expect-error A wrapping standalone parent must say how to lift canvas actions.
export const n4: ComponentProps<typeof NodeCanvas<Record<string, unknown>, Record<string, unknown>, Parent>> = {
	store: wrappingStore
};
