/**
 * Texture Factory
 *
 * Phase 1.2: TextureFactory with CORS and validation
 *
 * Creates WebGL textures from different element types with:
 * - CORS checking and handling
 * - Size validation and auto-scaling
 * - Memory tracking
 * - html2canvas integration for text/html
 */

import { OverlayError, OverlayErrorCode } from '../utils/overlay-error.js';
import { TextureValidator } from '../utils/texture-validator.js';
import { HTMLSanitizer } from '../utils/html-sanitizer.js';
import type {
	ElementType,
	TextureCreationOptions,
	TextureCreationResult
} from './overlay-types.js';

export class TextureFactory {
	private textureValidator: TextureValidator;
	private htmlSanitizer: HTMLSanitizer;

	constructor(
		private gl: WebGLRenderingContext,
		private maxTextureSize: number,
		private memoryBudget: number,
		private needsCORSWorkaround: boolean
	) {
		this.textureValidator = new TextureValidator(gl, memoryBudget);
		this.htmlSanitizer = new HTMLSanitizer();
	}

	/**
	 * Create texture from any element type
	 *
	 * Routes to appropriate handler based on element type.
	 *
	 * @param options - Texture creation options
	 * @returns Texture creation result
	 */
	async createTexture(options: TextureCreationOptions): Promise<TextureCreationResult> {
		const { element, type } = options;

		try {
			switch (type) {
				case 'image':
					return this.createImageTexture(element as HTMLImageElement);
				case 'video':
					return this.createVideoTexture(element as HTMLVideoElement);
				case 'canvas':
					return this.createCanvasTexture(element as HTMLCanvasElement);
				case 'text':
				case 'html':
					return await this.createHtmlTexture(element as HTMLElement);
				default:
					const _exhaustive: never = type;
					return {
						error: OverlayError.invalidElement(
							element.id || 'unknown',
							`Unsupported element type: ${_exhaustive}`
						)
					};
			}
		} catch (error) {
			console.error('[TextureFactory] Texture creation failed:', error);
			return {
				error: OverlayError.textureCreationFailed(
					element.id || 'unknown',
					error instanceof Error ? error.message : String(error)
				)
			};
		}
	}

	/**
	 * Create texture from image element
	 *
	 * Handles:
	 * - CORS checking
	 * - Size validation
	 * - Auto-scaling
	 *
	 * @param img - Image element
	 * @returns Texture creation result
	 */
	private createImageTexture(img: HTMLImageElement): TextureCreationResult {
		const gl = this.gl;

		// Check if image is loaded
		if (!img.complete || img.naturalWidth === 0) {
			return {
				error: OverlayError.invalidElement(img.id || 'image', 'Image not loaded')
			};
		}

		// Check CORS
		if (this.needsCORSWorkaround && !this.hasValidCORS(img)) {
			return {
				error: OverlayError.corsTaintedCanvas(img.id || 'image', img.src)
			};
		}

		const width = img.naturalWidth;
		const height = img.naturalHeight;

		// Validate size
		const validation = this.textureValidator.validateSize(width, height);
		if (!validation.valid) {
			// Try auto-scaling
			if (validation.scaled) {
				console.warn(
					`[TextureFactory] Image ${img.id} too large (${width}x${height}), scaling to ${validation.scaled.width}x${validation.scaled.height}`
				);
				return this.createScaledImageTexture(img, validation.scaled.width, validation.scaled.height);
			}

			return {
				error: OverlayError.textureTooLarge(
					img.id || 'image',
					width,
					height,
					this.maxTextureSize,
					validation.reason
				)
			};
		}

		// Create texture
		const texture = gl.createTexture();
		if (!texture) {
			return {
				error: OverlayError.textureCreationFailed(img.id || 'image', 'Failed to create WebGL texture')
			};
		}

		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Upload image data
		try {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		} catch (error) {
			gl.deleteTexture(texture);
			return {
				error: OverlayError.corsTaintedCanvas(
					img.id || 'image',
					img.src,
					error instanceof Error ? error.message : undefined
				)
			};
		}

		// Set texture parameters
		this.setTextureParameters(gl, texture);

		// Track memory allocation
		this.textureValidator.trackAllocation(width, height);

		return { texture, width, height };
	}

	/**
	 * Create scaled image texture
	 *
	 * Uses canvas to scale down oversized images.
	 *
	 * @param img - Image element
	 * @param targetWidth - Target width
	 * @param targetHeight - Target height
	 * @returns Texture creation result
	 */
	private createScaledImageTexture(
		img: HTMLImageElement,
		targetWidth: number,
		targetHeight: number
	): TextureCreationResult {
		const gl = this.gl;

		// Create canvas for scaling
		const canvas = document.createElement('canvas');
		canvas.width = targetWidth;
		canvas.height = targetHeight;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return {
				error: OverlayError.textureCreationFailed(
					img.id || 'image',
					'Failed to create 2D context for scaling'
				)
			};
		}

		// Draw scaled image
		ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

		// Create texture from canvas
		return this.createCanvasTexture(canvas);
	}

	/**
	 * Create texture from video element
	 *
	 * Similar to image texture but handles video-specific quirks.
	 *
	 * @param video - Video element
	 * @returns Texture creation result
	 */
	private createVideoTexture(video: HTMLVideoElement): TextureCreationResult {
		const gl = this.gl;

		// Check if video has valid dimensions
		if (video.videoWidth === 0 || video.videoHeight === 0) {
			return {
				error: OverlayError.invalidElement(
					video.id || 'video',
					'Video has no dimensions (not loaded or invalid)'
				)
			};
		}

		const width = video.videoWidth;
		const height = video.videoHeight;

		// Validate size
		const validation = this.textureValidator.validateSize(width, height);
		if (!validation.valid) {
			return {
				error: OverlayError.textureTooLarge(
					video.id || 'video',
					width,
					height,
					this.maxTextureSize,
					validation.reason
				)
			};
		}

		// Create texture
		const texture = gl.createTexture();
		if (!texture) {
			return {
				error: OverlayError.textureCreationFailed(
					video.id || 'video',
					'Failed to create WebGL texture'
				)
			};
		}

		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Upload video frame
		try {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
		} catch (error) {
			gl.deleteTexture(texture);
			return {
				error: OverlayError.corsTaintedCanvas(
					video.id || 'video',
					video.src,
					error instanceof Error ? error.message : undefined
				)
			};
		}

		// Set texture parameters
		this.setTextureParameters(gl, texture);

		// Track memory allocation
		this.textureValidator.trackAllocation(width, height);

		return { texture, width, height };
	}

	/**
	 * Create texture from canvas element
	 *
	 * @param canvas - Canvas element
	 * @returns Texture creation result
	 */
	private createCanvasTexture(canvas: HTMLCanvasElement): TextureCreationResult {
		const gl = this.gl;

		const width = canvas.width;
		const height = canvas.height;

		// Validate size
		const validation = this.textureValidator.validateSize(width, height);
		if (!validation.valid) {
			return {
				error: OverlayError.textureTooLarge(
					canvas.id || 'canvas',
					width,
					height,
					this.maxTextureSize,
					validation.reason
				)
			};
		}

		// Create texture
		const texture = gl.createTexture();
		if (!texture) {
			return {
				error: OverlayError.textureCreationFailed(
					canvas.id || 'canvas',
					'Failed to create WebGL texture'
				)
			};
		}

		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Upload canvas data
		try {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
		} catch (error) {
			gl.deleteTexture(texture);
			return {
				error: OverlayError.textureCreationFailed(
					canvas.id || 'canvas',
					error instanceof Error ? error.message : String(error)
				)
			};
		}

		// Set texture parameters
		this.setTextureParameters(gl, texture);

		// Track memory allocation
		this.textureValidator.trackAllocation(width, height);

		return { texture, width, height };
	}

	/**
	 * Create texture from HTML element using html2canvas
	 *
	 * Used for text and complex HTML elements.
	 *
	 * @param element - HTML element
	 * @returns Texture creation result
	 */
	private async createHtmlTexture(element: HTMLElement): Promise<TextureCreationResult> {
		// Security check
		const safetyCheck = this.htmlSanitizer.isSafeToRender(element);
		if (!safetyCheck.safe) {
			console.warn('[TextureFactory] HTML element has security risks:', safetyCheck);
			return {
				error: OverlayError.invalidElement(
					element.id || 'html',
					`HTML element has security risks: ${safetyCheck.reason}`
				)
			};
		}

		// Check if html2canvas is available
		if (typeof window === 'undefined' || !(window as any).html2canvas) {
			return {
				error: OverlayError.textureCreationFailed(
					element.id || 'html',
					'html2canvas library not loaded (required for text/html elements)'
				)
			};
		}

		try {
			// Render element to canvas using html2canvas
			const canvas = await (window as any).html2canvas(element, {
				backgroundColor: null, // Transparent background
				logging: false,
				useCORS: true
			});

			// Create texture from canvas
			return this.createCanvasTexture(canvas);
		} catch (error) {
			return {
				error: OverlayError.textureCreationFailed(
					element.id || 'html',
					`html2canvas failed: ${error instanceof Error ? error.message : String(error)}`
				)
			};
		}
	}

	/**
	 * Update existing texture from element
	 *
	 * More efficient than recreating texture (reuses same WebGL texture object).
	 *
	 * @param texture - Existing WebGL texture
	 * @param element - Element to update from
	 * @param type - Element type
	 * @returns Success or error
	 */
	updateTexture(
		texture: WebGLTexture,
		element: HTMLElement,
		type: ElementType
	): { success: boolean; error?: OverlayError } {
		const gl = this.gl;

		gl.bindTexture(gl.TEXTURE_2D, texture);

		try {
			switch (type) {
				case 'image':
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						element as HTMLImageElement
					);
					return { success: true };

				case 'video':
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						element as HTMLVideoElement
					);
					return { success: true };

				case 'canvas':
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						element as HTMLCanvasElement
					);
					return { success: true };

				case 'text':
				case 'html':
					// HTML elements require full recreation via html2canvas
					return {
						success: false,
						error: OverlayError.invalidElement(
							element.id || 'html',
							'HTML/text elements require full texture recreation (not update)'
						)
					};

				default:
					const _exhaustive: never = type;
					return {
						success: false,
						error: OverlayError.invalidElement(
							element.id || 'unknown',
							`Unsupported element type: ${_exhaustive}`
						)
					};
			}
		} catch (error) {
			return {
				success: false,
				error: OverlayError.textureCreationFailed(
					element.id || 'unknown',
					error instanceof Error ? error.message : String(error)
				)
			};
		}
	}

	/**
	 * Delete texture and free memory
	 *
	 * @param texture - WebGL texture to delete
	 * @param width - Texture width (for memory tracking)
	 * @param height - Texture height (for memory tracking)
	 */
	deleteTexture(texture: WebGLTexture, width: number, height: number): void {
		this.gl.deleteTexture(texture);
		this.textureValidator.trackDeallocation(width, height);
	}

	/**
	 * Check if element has valid CORS configuration
	 *
	 * @param element - Image or video element
	 * @returns true if CORS is valid
	 */
	private hasValidCORS(element: HTMLImageElement | HTMLVideoElement): boolean {
		// Check crossOrigin attribute
		const crossOrigin = element.crossOrigin;
		if (crossOrigin === 'anonymous' || crossOrigin === 'use-credentials') {
			return true;
		}

		// Check if same-origin
		try {
			const url = new URL(
				element instanceof HTMLImageElement ? element.src : element.currentSrc || element.src
			);
			return url.origin === window.location.origin;
		} catch {
			// Invalid URL, assume not same-origin
			return false;
		}
	}

	/**
	 * Set standard texture parameters
	 *
	 * @param gl - WebGL context
	 * @param texture - Texture to configure
	 */
	private setTextureParameters(gl: WebGLRenderingContext, texture: WebGLTexture): void {
		gl.bindTexture(gl.TEXTURE_2D, texture);

		// Wrapping mode (clamp to edge)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		// Filtering mode (linear for better quality)
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	}

	/**
	 * Get memory usage statistics
	 *
	 * @returns Current and maximum memory usage
	 */
	getMemoryUsage() {
		return this.textureValidator.getMemoryUsage();
	}

	/**
	 * Get maximum texture size
	 *
	 * @returns Maximum texture dimension
	 */
	getMaxTextureSize(): number {
		return this.maxTextureSize;
	}
}
