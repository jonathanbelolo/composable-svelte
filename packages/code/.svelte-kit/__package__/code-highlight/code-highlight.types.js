/**
 * CodeHighlight component types
 *
 * Read-only syntax highlighting component using Prism.js
 */
/**
 * Initial state factory for CodeHighlight
 */
export function createInitialState(config = {}) {
    return {
        code: config.code ?? '',
        language: config.language ?? 'typescript',
        theme: config.theme ?? 'dark',
        showLineNumbers: config.showLineNumbers ?? true,
        highlightedCode: config.highlightedCode ?? null,
        copyStatus: config.copyStatus ?? 'idle',
        startLine: config.startLine ?? 1,
        highlightLines: config.highlightLines ?? [],
        isHighlighting: config.isHighlighting ?? false,
        error: config.error ?? null
    };
}
