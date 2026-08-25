/**
 * Texture Factory
 *
 * Phase 1.2: TextureFactory with CORS and validation
 *
 * Creates WebGL textures from different element types with:
 * - CORS checking and handling
 * - Size validation and auto-scaling
 * - Memory tracking
 */

import { OverlayError, OverlayErrorCode } from '../utils/overlay-error.js';
import { TextureValidator, type TextureValidationResult } from '../utils/texture-validator.js';
import { noDebug, type DebugLog } from '../utils/debug.js';
import type {
	ElementType,
	TextureCreationOptions,
	TextureCreationResult
} from './overlay-types.js';

export class TextureFactory {
	private textureValidator: TextureValidator;
	/** Retained scratch canvas for downscaling on the update path. */
	private scratch: HTMLCanvasElement | null = null;

	constructor(
		private gl: WebGLRenderingContext,
		private maxTextureSize: number,
		// Not a field: it is forwarded to the validator on the next line and
		// never read again. It was `private memoryBudget`, which made it a
		// write-only property of the class — the category `457c7e6` deleted ten
		// members for, on this very class.
		memoryBudget: number,
		private needsCORSWorkaround: boolean,
		log: DebugLog = noDebug
	) {
		this.textureValidator = new TextureValidator(gl, maxTextureSize, memoryBudget, log);
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
				default:
					const _exhaustive: never = type;
					return {
						error: OverlayError.invalidElementType(
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
				error: OverlayError.invalidElementType(img.id || 'image', 'Image not loaded')
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
				error: this.validationError(validation, img.id || 'image', width, height)
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
				error: OverlayError.invalidElementType(
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
				error: this.validationError(validation, video.id || 'video', width, height)
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
				error: this.validationError(validation, canvas.id || 'canvas', width, height)
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
		type: ElementType,
		tracked?: { width: number; height: number }
	): { success: boolean; error?: OverlayError; width?: number; height?: number } {
		const gl = this.gl;

		// Validate and account for the re-upload before performing it.
		//
		// This did neither, which meant `maxTextureSize` and `memoryBudget`
		// bounded only the first upload. A `<video>` that switches resolution
		// mid-playback, or a `<canvas>` the app resizes before calling
		// `updateElement()`, went straight to `texImage2D` at whatever size it
		// had reached — past the size cap, and without the tracked bytes ever
		// moving, so the budget stayed wrong for the life of the overlay.
		const size = this.elementSize(element, type);

		// The accounting is settled *after* the upload, not before it.
		//
		// This used to deallocate the old size and allocate the new one up
		// front, and three of the failure returns below never put it back — so
		// a `texImage2D` that threw left the difference charged, and charged it
		// again on every retry. Measured: five failed updates of a 100×100
		// element grown to 200×200 left 640000 bytes tracked against a texture
		// of 40000, and one failure plus an unregister left 600000 charged with
		// no live textures at all, after which every registration was refused.
		// A cross-origin video source throws `SecurityError` here roughly sixty
		// times a second.
		const previous = size ? (tracked ?? size) : null;
		const settle = (uploaded: { width: number; height: number }) => {
			if (!previous) return;
			this.textureValidator.trackDeallocation(previous.width, previous.height);
			this.textureValidator.trackAllocation(uploaded.width, uploaded.height);
		};

		if (size && previous) {
			// Validated against the budget *minus* the outgoing texture, since
			// this replaces one rather than adding one — otherwise a re-upload
			// that fits perfectly well is refused for the space it already has.
			this.textureValidator.trackDeallocation(previous.width, previous.height);
			const validation = this.textureValidator.validateSize(size.width, size.height);
			this.textureValidator.trackAllocation(previous.width, previous.height);

			if (!validation.valid && !validation.scaled) {
				return {
					success: false,
					error: this.validationError(
						validation,
						element.id || 'unknown',
						size.width,
						size.height
					)
				};
			}

			// Over the size cap: upload a scaled copy, as creation does, rather
			// than handing the driver dimensions it will refuse.
			if (validation.scaled) {
				const target = validation.scaled;
				const scaled = this.drawScaled(element, target.width, target.height);
				if (!scaled) {
					return {
						success: false,
						error: OverlayError.textureCreationFailed(
							element.id || 'unknown',
							'Failed to create 2D context for scaling'
						)
					};
				}
				gl.bindTexture(gl.TEXTURE_2D, texture);
				try {
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scaled);
					settle(target);
					return { success: true, width: target.width, height: target.height };
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
		}

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
					if (size) settle(size);
					return { success: true, ...(size ?? {}) };

				case 'video':
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						element as HTMLVideoElement
					);
					if (size) settle(size);
					return { success: true, ...(size ?? {}) };

				case 'canvas':
					gl.texImage2D(
						gl.TEXTURE_2D,
						0,
						gl.RGBA,
						gl.RGBA,
						gl.UNSIGNED_BYTE,
						element as HTMLCanvasElement
					);
					if (size) settle(size);
					return { success: true, ...(size ?? {}) };

				default:
					const _exhaustive: never = type;
					return {
						success: false,
						error: OverlayError.invalidElementType(
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
	 * The error a failed validation actually describes.
	 *
	 * Every call site used to reach for `textureTooLarge`, so a `memoryBudget`
	 * refusal arrived as `TEXTURE_TOO_LARGE` with a message about the device
	 * maximum and advice to reduce the image size — and `memoryBudgetExceeded`,
	 * whose recovery text `82412fa` deliberately rewrote to name the reachable
	 * option, had no callers at all.
	 */
	private validationError(
		validation: TextureValidationResult,
		id: string,
		width: number,
		height: number
	): OverlayError {
		if (validation.failure === 'budget') {
			const usage = this.textureValidator.getMemoryUsage();
			return OverlayError.memoryBudgetExceeded(usage.used, usage.budget, width * height * 4);
		}
		return OverlayError.textureTooLarge(id, width, height, this.maxTextureSize, validation.reason);
	}

	/**
	 * Pixel dimensions of an element's current content.
	 *
	 * Not its layout size: the texture is the source pixels, and for a video
	 * those change when the stream switches resolution.
	 */
	private elementSize(
		element: HTMLElement,
		type: ElementType
	): { width: number; height: number } | null {
		switch (type) {
			case 'image': {
				const img = element as HTMLImageElement;
				return img.naturalWidth > 0 ? { width: img.naturalWidth, height: img.naturalHeight } : null;
			}
			case 'video': {
				const video = element as HTMLVideoElement;
				return video.videoWidth > 0 ? { width: video.videoWidth, height: video.videoHeight } : null;
			}
			case 'canvas': {
				const canvas = element as HTMLCanvasElement;
				return canvas.width > 0 ? { width: canvas.width, height: canvas.height } : null;
			}
			default: {
				const _exhaustive: never = type;
				return _exhaustive;
			}
		}
	}

	/**
	 * Draw an element into a scratch canvas at the given size.
	 *
	 * The canvas is retained rather than allocated per call: this runs on the
	 * update path, which for a `frame`-strategy video is every frame.
	 */
	private drawScaled(
		element: HTMLElement,
		width: number,
		height: number
	): HTMLCanvasElement | null {
		if (!this.scratch) {
			this.scratch = document.createElement('canvas');
		}
		this.scratch.width = width;
		this.scratch.height = height;

		const ctx = this.scratch.getContext('2d');
		if (!ctx) return null;

		ctx.drawImage(element as CanvasImageSource, 0, 0, width, height);
		return this.scratch;
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

}
