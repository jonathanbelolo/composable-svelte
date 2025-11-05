/**
 * Prism.js integration wrapper
 *
 * Provides modular language loading for tree-shaking
 */
import Prism from 'prismjs';
// Track loaded languages to avoid re-imports
const loadedLanguages = new Set(['markup', 'css', 'clike', 'javascript']);
/**
 * Dynamically load a Prism language grammar
 *
 * Uses dynamic imports for tree-shaking - only languages used are bundled
 *
 * @param lang - Programming language to load
 */
export async function loadLanguage(lang) {
    // Skip if already loaded
    if (loadedLanguages.has(lang) || Prism.languages[lang]) {
        return;
    }
    try {
        switch (lang) {
            case 'typescript':
                // TypeScript requires JavaScript first
                await import('prismjs/components/prism-typescript');
                break;
            case 'javascript':
                // JavaScript is loaded by default via 'clike'
                break;
            case 'svelte':
                // Svelte syntax highlighting
                await import('prismjs/components/prism-javascript');
                await import('prismjs/components/prism-typescript');
                // Note: Svelte doesn't have official Prism support, treat as TypeScript for now
                break;
            case 'html':
                // Markup is loaded by default
                break;
            case 'css':
                // CSS is loaded by default
                break;
            case 'json':
                await import('prismjs/components/prism-json');
                break;
            case 'markdown':
                await import('prismjs/components/prism-markdown');
                break;
            case 'bash':
                await import('prismjs/components/prism-bash');
                break;
            case 'sql':
                await import('prismjs/components/prism-sql');
                break;
            case 'python':
                await import('prismjs/components/prism-python');
                break;
            case 'rust':
                await import('prismjs/components/prism-rust');
                break;
            default:
                // Exhaustiveness check
                const _never = lang;
                console.warn(`Unsupported language: ${_never}`);
        }
        loadedLanguages.add(lang);
    }
    catch (error) {
        console.error(`Failed to load language '${lang}':`, error);
        throw new Error(`Failed to load language '${lang}'`);
    }
}
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
export async function highlightCode(code, language) {
    // Handle empty code
    if (!code || code.trim().length === 0) {
        return '';
    }
    // Ensure language is loaded
    await loadLanguage(language);
    // Get the grammar for the language
    const grammar = Prism.languages[language];
    if (!grammar) {
        // Fallback to plain text if language not available
        console.warn(`Language '${language}' not available, using plain text`);
        return escapeHtml(code);
    }
    try {
        // Highlight the code
        return Prism.highlight(code, grammar, language);
    }
    catch (error) {
        console.error(`Failed to highlight code:`, error);
        // Return escaped HTML on error
        return escapeHtml(code);
    }
}
/**
 * Escape HTML special characters
 *
 * Used as fallback when highlighting fails
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (char) => map[char] || char);
}
