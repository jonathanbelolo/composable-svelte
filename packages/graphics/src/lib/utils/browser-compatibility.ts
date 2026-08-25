/**
 * Browser Compatibility Layer
 *
 * Detects browser type and handles browser-specific WebGL quirks.
 *
 * Different browsers have subtle WebGL differences:
 * - Safari: Stricter CORS, different texture filtering
 * - Firefox: Different extension support
 * - Edge: Chromium-based but some differences
 */

import { debugLog } from './debug.js';

export type BrowserType = 'chrome' | 'firefox' | 'safari' | 'edge' | 'unknown';

export interface BrowserInfo {
	browser: BrowserType;
	version: number;
	needsCORSWorkaround: boolean;
	supportsRequestVideoFrameCallback: boolean;
}

export class BrowserCompatibility {
	readonly browser: BrowserType;
	readonly version: number;

	constructor() {
		const ua = navigator.userAgent;

		// Detect browser type and version
		if (ua.includes('Edg/')) {
			this.browser = 'edge';
			this.version = parseInt(ua.match(/Edg\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Chrome/')) {
			this.browser = 'chrome';
			this.version = parseInt(ua.match(/Chrome\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Firefox/')) {
			this.browser = 'firefox';
			this.version = parseInt(ua.match(/Firefox\/(\d+)/)?.[1] || '0');
		} else if (ua.includes('Safari/')) {
			this.browser = 'safari';
			this.version = parseInt(ua.match(/Version\/(\d+)/)?.[1] || '0');
		} else {
			this.browser = 'unknown';
			this.version = 0;
		}

		this.logBrowserInfo();
	}

	/**
	 * Log browser information to console
	 */
	logBrowserInfo(): void {
		debugLog('[WebGLOverlay] Browser:', {
			browser: this.browser,
			version: this.version,
			needsCORSWorkaround: this.needsCORSWorkaround(),
			supportsRequestVideoFrameCallback: this.supportsRequestVideoFrameCallback()
		});
	}

	/**
	 * Check if browser needs CORS workaround
	 *
	 * Safari is stricter with CORS than other browsers.
	 * Images without proper CORS headers will taint the canvas.
	 *
	 * @returns true if browser needs extra CORS handling
	 */
	needsCORSWorkaround(): boolean {
		return this.browser === 'safari';
	}

	/**
	 * Check if requestVideoFrameCallback is supported
	 *
	 * Chrome 83+, Edge 83+ support this API for efficient video frame updates.
	 * Firefox and Safari don't support it yet.
	 *
	 * @returns true if requestVideoFrameCallback is available
	 */
	supportsRequestVideoFrameCallback(): boolean {
		return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
	}

	/**
	 * Get list of supported WebGL extensions
	 *
	 * @param gl - WebGL context
	 * @returns Array of extension names
	 */
	getSupportedExtensions(gl: WebGLRenderingContext): string[] {
		return gl.getSupportedExtensions() || [];
	}

	/**
	 * Get browser info as plain object
	 *
	 * Useful for logging or analytics
	 *
	 * @returns Browser information object
	 */
	getBrowserInfo(): BrowserInfo {
		return {
			browser: this.browser,
			version: this.version,
			needsCORSWorkaround: this.needsCORSWorkaround(),
			supportsRequestVideoFrameCallback: this.supportsRequestVideoFrameCallback()
		};
	}

}
