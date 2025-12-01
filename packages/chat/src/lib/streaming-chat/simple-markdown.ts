/**
 * Simple Markdown Renderer
 *
 * Lightweight markdown rendering using only `marked` library.
 * No syntax highlighting, no media extraction - just basic markdown to HTML.
 *
 * Use this for minimal chat implementations that don't need heavy dependencies.
 */

import { marked } from 'marked';

/**
 * Configure marked with basic settings (no syntax highlighting)
 */
function configureSimpleMarked() {
	marked.setOptions({
		gfm: true, // GitHub Flavored Markdown
		breaks: true // Convert line breaks to <br>
	});

	const renderer = new marked.Renderer();

	// Simple code block rendering without syntax highlighting
	renderer.code = ({ text, lang }) => {
		const language = lang || 'plaintext';
		return `<pre class="language-${language}"><code class="language-${language}">${escapeHtml(text)}</code></pre>`;
	};

	// Inline code rendering
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
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, (char) => map[char]!);
}

/**
 * Render markdown to HTML (simple version without syntax highlighting)
 *
 * @param markdown - Markdown text to render
 * @param isStreaming - Whether the content is still streaming (handles partial markdown)
 * @returns HTML string
 */
export function renderSimpleMarkdown(markdown: string, isStreaming = false): string {
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
 * Attach copy buttons to code blocks in rendered HTML
 *
 * @param container - The container element containing rendered markdown
 * @returns Cleanup function to remove event listeners
 */
export function attachSimpleCopyButtons(container: HTMLElement): () => void {
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
		const language = languageMatch ? languageMatch[1]! : 'code';

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
			const textContent = code.textContent ?? '';

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
configureSimpleMarked();
