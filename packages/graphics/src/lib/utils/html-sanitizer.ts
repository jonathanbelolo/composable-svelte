/**
 * HTML Sanitizer
 *
 * Detects security risks in HTML content before rendering with html2canvas.
 *
 * CRITICAL: html2canvas can execute JavaScript during rendering:
 * - Inline scripts (<script> tags)
 * - Event handlers (onclick, onerror, etc.)
 * - javascript: URLs
 * - Cross-origin iframes
 *
 * This class detects these risks but does NOT sanitize content.
 * For user-generated content, use DOMPurify before passing to WebGLOverlay.
 */

export interface SafetyCheckResult {
	safe: boolean;
	reason?: string;
	risks?: string[];
}

export class HTMLSanitizer {
	// Event handler attributes that can execute JavaScript
	private readonly eventAttributes = [
		'onclick',
		'onload',
		'onerror',
		'onmouseover',
		'onmouseout',
		'onfocus',
		'onblur',
		'onchange',
		'onsubmit',
		'onkeydown',
		'onkeyup',
		'onkeypress',
		'ondblclick',
		'oncontextmenu'
	];

	/**
	 * Check if element is safe to render with html2canvas
	 *
	 * Returns detailed safety information including specific risks found.
	 *
	 * @param element - HTML element to check
	 * @returns Safety check result
	 */
	isSafeToRender(element: HTMLElement): SafetyCheckResult {
		const risks: string[] = [];

		// Check for script tags
		const scripts = element.querySelectorAll('script');
		if (scripts.length > 0) {
			risks.push(`Contains ${scripts.length} <script> tag(s) - potential XSS risk`);
		}

		// Check for inline event handlers
		const eventHandlers = this.findInlineEventHandlers(element);
		if (eventHandlers.length > 0) {
			risks.push(
				`Contains ${eventHandlers.length} inline event handler(s): ${eventHandlers.slice(0, 3).join(', ')}${eventHandlers.length > 3 ? '...' : ''}`
			);
		}

		// Check for javascript: URLs
		const javascriptUrls = this.findJavascriptUrls(element);
		if (javascriptUrls.length > 0) {
			risks.push(`Contains ${javascriptUrls.length} javascript: URL(s) - potential XSS risk`);
		}

		// Check for iframes (cross-origin iframes can't be rendered)
		const iframes = element.querySelectorAll('iframe');
		if (iframes.length > 0) {
			risks.push(
				`Contains ${iframes.length} <iframe>(s) - cross-origin iframes cannot be rendered`
			);
		}

		// Check for potentially dangerous content
		const dangerous = this.findDangerousContent(element);
		if (dangerous.length > 0) {
			risks.push(...dangerous);
		}

		if (risks.length > 0) {
			return {
				safe: false,
				reason: 'Element contains potential security risks or unrenderable content',
				risks
			};
		}

		return { safe: true };
	}

	/**
	 * Find inline event handlers in element tree
	 *
	 * @param element - Root element to search
	 * @returns Array of found event handler names
	 */
	private findInlineEventHandlers(element: HTMLElement): string[] {
		const found: string[] = [];
		const allElements = [element, ...Array.from(element.querySelectorAll('*'))];

		for (const el of allElements) {
			for (const attr of this.eventAttributes) {
				if (el.hasAttribute(attr)) {
					found.push(`${el.tagName.toLowerCase()}.${attr}`);
				}
			}
		}

		return found;
	}

	/**
	 * Find javascript: URLs in links and images
	 *
	 * @param element - Root element to search
	 * @returns Array of found javascript: URLs
	 */
	private findJavascriptUrls(element: HTMLElement): string[] {
		const found: string[] = [];
		const links = element.querySelectorAll('a[href], img[src], link[href]');

		for (const link of Array.from(links)) {
			const url = link.getAttribute('href') || link.getAttribute('src');
			if (url && url.trim().toLowerCase().startsWith('javascript:')) {
				found.push(`${link.tagName.toLowerCase()}: ${url.slice(0, 50)}...`);
			}
		}

		return found;
	}

	/**
	 * Find other potentially dangerous content
	 *
	 * @param element - Root element to search
	 * @returns Array of found dangerous content descriptions
	 */
	private findDangerousContent(element: HTMLElement): string[] {
		const found: string[] = [];

		// Check for object/embed tags (can contain plugins)
		const objects = element.querySelectorAll('object, embed');
		if (objects.length > 0) {
			found.push(`Contains ${objects.length} <object>/<embed> tag(s) - plugin content`);
		}

		// Check for base tag (can redirect URLs)
		const base = element.querySelector('base');
		if (base) {
			found.push('Contains <base> tag - can redirect relative URLs');
		}

		// Check for meta refresh (can redirect)
		const metaRefresh = element.querySelector('meta[http-equiv="refresh"]');
		if (metaRefresh) {
			found.push('Contains <meta http-equiv="refresh"> - can redirect page');
		}

		return found;
	}

	/**
	 * Get recommended sanitization library
	 *
	 * Returns null if content is trusted, library recommendation if not.
	 *
	 * @param isTrustedContent - Is the content from a trusted source?
	 * @returns Library recommendation or null
	 */
	getRecommendedSanitizer(isTrustedContent: boolean): string | null {
		if (isTrustedContent) {
			return null; // No sanitization needed for trusted content
		}

		// For user-generated content, strongly recommend DOMPurify
		return 'DOMPurify (https://github.com/cure53/DOMPurify)';
	}

	/**
	 * Check if element contains user-generated content
	 *
	 * Heuristic check - looks for common indicators of UGC.
	 *
	 * @param element - Element to check
	 * @returns true if likely contains user-generated content
	 */
	isLikelyUserGeneratedContent(element: HTMLElement): boolean {
		// Check for contenteditable
		if (element.isContentEditable) {
			return true;
		}

		// Check for common UGC class names
		const classList = element.className.toLowerCase();
		const ugcIndicators = ['comment', 'post', 'message', 'review', 'description', 'bio'];
		for (const indicator of ugcIndicators) {
			if (classList.includes(indicator)) {
				return true;
			}
		}

		// Check for data attributes indicating UGC
		if (element.dataset.userContent || element.dataset.ugc) {
			return true;
		}

		return false;
	}

	/**
	 * Get safety report as string
	 *
	 * Useful for logging or displaying to developers.
	 *
	 * @param result - Safety check result
	 * @returns Formatted safety report
	 */
	formatSafetyReport(result: SafetyCheckResult): string {
		if (result.safe) {
			return '✅ Element is safe to render';
		}

		let report = `❌ Element is NOT safe to render\n`;
		report += `Reason: ${result.reason}\n\n`;

		if (result.risks && result.risks.length > 0) {
			report += `Risks found:\n`;
			for (const risk of result.risks) {
				report += `  • ${risk}\n`;
			}
		}

		report += `\nRecommendation: ${this.getRecommendedSanitizer(false)}`;

		return report;
	}
}
