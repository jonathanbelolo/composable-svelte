/**
 * Markdown Renderer
 *
 * Renders markdown to HTML with syntax highlighting support.
 * Designed to work with streaming content and partial markdown.
 */

import { marked } from 'marked';
import Prism from 'prismjs';
import { loadLanguage } from '../code-highlight/prism-wrapper';

// Language map for Prism
const LANGUAGE_MAP: Record<string, string> = {
	js: 'javascript',
	ts: 'typescript',
	jsx: 'javascript',
	tsx: 'typescript',
	py: 'python',
	rb: 'ruby',
	sh: 'bash',
	yml: 'yaml',
};

// Pre-load common languages on module initialization
const loadCommonLanguages = async () => {
	try {
		await Promise.all([
			loadLanguage('javascript'),
			loadLanguage('typescript'),
			loadLanguage('python'),
			loadLanguage('bash'),
			loadLanguage('json')
		]);
	} catch (error) {
		console.error('Failed to load common Prism languages:', error);
	}
};

// Start loading languages immediately
loadCommonLanguages();

/**
 * Configure marked with Prism syntax highlighting
 */
export function configureMarked() {
	marked.setOptions({
		gfm: true, // GitHub Flavored Markdown
		breaks: true, // Convert line breaks to <br>
		headerIds: false, // Don't generate header IDs
	});

	// Custom renderer for code blocks
	const renderer = new marked.Renderer();

	// Override code block rendering to use Prism
	renderer.code = ({ text, lang }) => {
		const language = lang ? LANGUAGE_MAP[lang] || lang : 'plaintext';

		try {
			// Check if language is supported
			if (language !== 'plaintext' && Prism.languages[language]) {
				const highlighted = Prism.highlight(text, Prism.languages[language], language);
				return `<pre class="language-${language}"><code class="language-${language}">${highlighted}</code></pre>`;
			}
		} catch (e) {
			// Fall back to plain code if highlighting fails
			console.warn(`Failed to highlight code block with language: ${language}`, e);
		}

		// Fallback for unsupported languages
		return `<pre class="language-plaintext"><code class="language-plaintext">${escapeHtml(text)}</code></pre>`;
	};

	// Override inline code rendering
	renderer.codespan = ({ text }) => {
		return `<code class="inline-code">${escapeHtml(text)}</code>`;
	};

	marked.use({ renderer });
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	};
	return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Render markdown to HTML
 *
 * @param markdown - Markdown text to render
 * @param isStreaming - Whether the content is still streaming (handles partial markdown)
 * @returns HTML string
 */
export function renderMarkdown(markdown: string, isStreaming = false): string {
	if (!markdown.trim()) {
		return '';
	}

	try {
		// If streaming and ends with incomplete code block, add closing fence
		let processedMarkdown = markdown;
		if (isStreaming) {
			processedMarkdown = fixPartialMarkdown(markdown);
		}

		const html = marked.parse(processedMarkdown, { async: false }) as string;
		return html;
	} catch (error) {
		console.error('Error rendering markdown:', error);
		// Fallback to escaped plain text
		return `<p>${escapeHtml(markdown)}</p>`;
	}
}

/**
 * Fix partial markdown for streaming content
 *
 * Handles incomplete code blocks and other partial markdown elements
 */
function fixPartialMarkdown(markdown: string): string {
	let fixed = markdown;

	// Check for unclosed code blocks
	const codeBlockRegex = /```(\w*)/g;
	const matches = [...markdown.matchAll(codeBlockRegex)];

	// If odd number of code fences, add closing fence
	if (matches.length % 2 !== 0) {
		fixed += '\n```';
	}

	return fixed;
}

/**
 * Check if text contains markdown syntax
 */
export function hasMarkdownSyntax(text: string): boolean {
	if (!text) return false;

	// Check for common markdown patterns
	const patterns = [
		/^#{1,6}\s/, // Headers
		/\*\*.*\*\*/, // Bold
		/\*.*\*/, // Italic
		/`.*`/, // Code
		/```/, // Code blocks
		/^\s*[-*+]\s/, // Unordered lists
		/^\s*\d+\.\s/, // Ordered lists
		/\[.*\]\(.*\)/, // Links
		/^\s*>/, // Blockquotes
	];

	return patterns.some((pattern) => pattern.test(text));
}

/**
 * Extract images from markdown content
 *
 * Parses markdown image syntax: ![alt](url "caption")
 * Returns array of image objects for use with ImageGallery component
 */
export function extractImagesFromMarkdown(markdown: string): Array<{
	id: string;
	url: string;
	alt: string;
	caption?: string;
}> {
	if (!markdown) return [];

	const images: Array<{
		id: string;
		url: string;
		alt: string;
		caption?: string;
	}> = [];

	// Match markdown image syntax: ![alt](url "optional caption")
	// Regex explanation:
	// !\[([^\]]*)\]  - Match ![...] and capture alt text
	// \(([^\s)]+)    - Match (url and capture URL (no spaces or closing paren)
	// (?:\s+"([^"]*)")? - Optionally match space + "caption" and capture caption
	// \)             - Match closing paren
	const imageRegex = /!\[([^\]]*)\]\(([^\s)]+)(?:\s+"([^"]*)")?\)/g;

	let match: RegExpExecArray | null;
	let index = 0;

	while ((match = imageRegex.exec(markdown)) !== null) {
		const alt = match[1] || 'Image';
		const url = match[2];
		const caption = match[3];

		// Generate unique ID
		const id = `img-${index}-${Date.now()}`;

		images.push({
			id,
			url,
			alt,
			caption
		});

		index++;
	}

	return images;
}

/**
 * Attach copy buttons to code blocks in rendered HTML
 *
 * @param container - The container element containing rendered markdown
 * @returns Cleanup function to remove event listeners
 */
export function attachCopyButtons(container: HTMLElement): () => void {
	const codeBlocks = container.querySelectorAll('pre');
	const cleanupFunctions: Array<() => void> = [];

	codeBlocks.forEach((pre) => {
		// Skip if button already attached
		if (pre.querySelector('.copy-button')) {
			return;
		}

		const code = pre.querySelector('code');
		if (!code) return;

		// Create wrapper div
		const wrapper = document.createElement('div');
		wrapper.className = 'code-block-wrapper';

		// Wrap the pre element
		pre.parentNode?.insertBefore(wrapper, pre);
		wrapper.appendChild(pre);

		// Create copy button
		const button = document.createElement('button');
		button.className = 'copy-button';
		button.setAttribute('aria-label', 'Copy code');
		button.innerHTML = `
			<svg class="copy-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M11 1H3C2.4 1 2 1.4 2 2V11C2 11.6 2.4 12 3 12H11C11.6 12 12 11.6 12 11V2C12 1.4 11.6 1 11 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
				<path d="M14 5V14C14 14.6 13.6 15 13 15H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
			<svg class="check-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M13 4L6 11L3 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		`;

		// Extract language from class
		const languageMatch = code.className.match(/language-(\w+)/);
		const language = languageMatch ? languageMatch[1] : 'code';

		// Create language badge
		if (language !== 'plaintext') {
			const badge = document.createElement('span');
			badge.className = 'language-badge';
			badge.textContent = language;
			wrapper.appendChild(badge);
		}

		// Add copy functionality
		let timeoutId: ReturnType<typeof setTimeout> | null = null;

		const handleClick = async () => {
			const textContent = code.textContent || '';

			try {
				await navigator.clipboard.writeText(textContent);

				// Show success state
				button.classList.add('copied');
				timeoutId = setTimeout(() => {
					button.classList.remove('copied');
				}, 2000);
			} catch (error) {
				console.error('Failed to copy code:', error);
			}
		};

		button.addEventListener('click', handleClick);
		wrapper.appendChild(button);

		// Store cleanup function
		cleanupFunctions.push(() => {
			button.removeEventListener('click', handleClick);
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
		});
	});

	// Return cleanup function that calls all individual cleanups
	return () => {
		cleanupFunctions.forEach((cleanup) => cleanup());
	};
}

// Configure marked on module load
configureMarked();
