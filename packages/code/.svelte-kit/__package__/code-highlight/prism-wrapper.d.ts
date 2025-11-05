/**
 * Prism.js integration wrapper
 *
 * Provides modular language loading for tree-shaking
 */
import type { SupportedLanguage } from './code-highlight.types';
/**
 * Dynamically load a Prism language grammar
 *
 * Uses dynamic imports for tree-shaking - only languages used are bundled
 *
 * @param lang - Programming language to load
 */
export declare function loadLanguage(lang: SupportedLanguage): Promise<void>;
/**
 * Highlight code using Prism.js
 *
 * Automatically loads language grammar if needed
 *
 * @param code - Source code to highlight
 * @param language - Programming language
 * @returns HTML string with syntax highlighting markup
 *
 * @example
 * ```typescript
 * const html = await highlightCode('const x = 5;', 'typescript');
 * // Returns: '<span class="token keyword">const</span> ...'
 * ```
 */
export declare function highlightCode(code: string, language: SupportedLanguage): Promise<string>;
//# sourceMappingURL=prism-wrapper.d.ts.map