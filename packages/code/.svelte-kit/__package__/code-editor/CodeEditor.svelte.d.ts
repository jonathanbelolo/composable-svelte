import type { Store } from '@composable-svelte/core';
import type { CodeEditorState, CodeEditorAction } from './code-editor.types';
type $$ComponentProps = {
    store: Store<CodeEditorState, CodeEditorAction>;
    showToolbar?: boolean;
};
declare const CodeEditor: import("svelte").Component<$$ComponentProps, {}, "">;
type CodeEditor = ReturnType<typeof CodeEditor>;
export default CodeEditor;
//# sourceMappingURL=CodeEditor.svelte.d.ts.map