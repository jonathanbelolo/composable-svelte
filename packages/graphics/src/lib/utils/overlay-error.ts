/**
 * Overlay Error Handling
 *
 * Structured error types with recovery suggestions.
 * Generic error messages aren't helpful - these provide context and actionable fixes.
 */

export enum OverlayErrorCode {
	WEBGL_NOT_SUPPORTED = 'WEBGL_NOT_SUPPORTED',
	CONTEXT_LOST = 'CONTEXT_LOST',
	TEXTURE_TOO_LARGE = 'TEXTURE_TOO_LARGE',
	SHADER_COMPILATION_FAILED = 'SHADER_COMPILATION_FAILED',
	CORS_TAINTED_CANVAS = 'CORS_TAINTED_CANVAS',
	MEMORY_BUDGET_EXCEEDED = 'MEMORY_BUDGET_EXCEEDED',
	INVALID_ELEMENT_TYPE = 'INVALID_ELEMENT_TYPE',
	ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
	TEXTURE_CREATION_FAILED = 'TEXTURE_CREATION_FAILED',
	/**
	 * The overlay could not be constructed for a reason that is not WebGL
	 * support — a missing `ResizeObserver`, say.
	 *
	 * Every constructor failure used to arrive as `WEBGL_NOT_SUPPORTED`, with
	 * recovery text telling the consumer to try a modern browser and visit
	 * get.webgl.org. That is the "wrong code, misleading recovery" defect this
	 * package spent a commit removing from `TEXTURE_TOO_LARGE`.
	 */
	INITIALIZATION_FAILED = 'INITIALIZATION_FAILED'
}

export class OverlayError extends Error {
	constructor(
		public code: OverlayErrorCode,
		message: string,
		public details?: Record<string, any>,
		public recovery?: string
	) {
		super(message);
		this.name = 'OverlayError';

		// Maintains proper stack trace for where error was thrown (V8 only).
		// Typed locally rather than by pulling @types/node into a browser
		// package's type environment: this is the only symbol graphics wanted
		// from it, and the cost of the rest is that `setTimeout` starts
		// returning NodeJS.Timeout and `Buffer`/`process` begin to typecheck in
		// code that would crash in a browser.
		const V8Error = Error as ErrorConstructor & {
			captureStackTrace?(target: object, constructorOpt?: Function): void;
		};
		V8Error.captureStackTrace?.(this, OverlayError);
	}

	/**
	 * WebGL is not supported in this browser
	 */
	static webGLNotSupported(reason?: string): OverlayError {
		return new OverlayError(
			OverlayErrorCode.WEBGL_NOT_SUPPORTED,
			reason || 'WebGL is not supported in this browser',
			reason ? { reason } : {},
			'Use a modern browser that supports WebGL (Chrome, Firefox, Safari, Edge). Check https://get.webgl.org/ to verify WebGL support.'
		);
	}

	/**
	 * WebGL context was lost
	 */
	static contextLost(): OverlayError {
		return new OverlayError(
			OverlayErrorCode.CONTEXT_LOST,
			'WebGL context was lost',
			{},
			'Wait for automatic context restoration. If the issue persists, reload the page. Context loss can occur due to GPU driver issues or memory pressure.'
		);
	}

	/**
	 * Texture dimensions exceed device maximum
	 */
	static textureTooLarge(
		elementId: string,
		width: number,
		height: number,
		maxSize: number,
		reason?: string
	): OverlayError {
		// "the limit in force", not "device maximum": `maxSize` is
		// `min(maxTextureSize, driver max)`, so a consumer who set 2048 on an
		// 8192-capable device was told the *device* refused them. And the old
		// recovery advised "enable auto-scaling", which is not a field of
		// `OverlayOptions` — the same "call something you cannot call" defect
		// that `82412fa` fixed on `memoryBudgetExceeded`.
		return new OverlayError(
			OverlayErrorCode.TEXTURE_TOO_LARGE,
			`Texture size ${width}x${height} exceeds the ${maxSize}x${maxSize} limit in force (element: ${elementId})${reason ? ': ' + reason : ''}`,
			{ elementId, width, height, maxSize, reason },
			'Use a smaller source, or raise `maxTextureSize` in OverlayOptions — it can only narrow the limit, never exceed what the driver allows. Images are scaled down automatically; canvases and videos are not.'
		);
	}

	/**
	 * The overlay could not be built, for a reason other than WebGL support
	 */
	static initializationFailed(reason: string): OverlayError {
		return new OverlayError(
			OverlayErrorCode.INITIALIZATION_FAILED,
			`Overlay initialization failed: ${reason}`,
			{ reason },
			'This is not a WebGL support problem — the context was available. Check that the environment provides IntersectionObserver and ResizeObserver, and that the canvas is attached.'
		);
	}

	/**
	 * Shader compilation failed
	 */
	static shaderCompilationFailed(shaderType: string, log: string): OverlayError {
		return new OverlayError(
			OverlayErrorCode.SHADER_COMPILATION_FAILED,
			`Failed to compile ${shaderType} shader`,
			{ shaderType, log },
			'Check shader GLSL syntax and uniform declarations. Review shader compilation log for specific errors.'
		);
	}

	/**
	 * Cannot create texture from cross-origin image
	 */
	static corsTaintedCanvas(elementId: string, imageUrl?: string, errorMessage?: string): OverlayError {
		return new OverlayError(
			OverlayErrorCode.CORS_TAINTED_CANVAS,
			`Cannot create texture from cross-origin image (element: ${elementId})${errorMessage ? ': ' + errorMessage : ''}`,
			{ elementId, imageUrl, errorMessage },
			'Add crossOrigin="anonymous" attribute to image element, or serve images from the same origin. Ensure the image server has proper CORS headers (Access-Control-Allow-Origin).'
		);
	}

	/**
	 * Texture memory budget exceeded
	 *
	 * The recovery line used to advise calling `setMemoryBudget()` — a method on
	 * `TextureValidator`, which is a private field of `TextureFactory`, which no
	 * consumer can reach. It told people to call something they could not call.
	 * `memoryBudget` in `OverlayOptions` is the reachable lever, and it now
	 * actually bounds anything.
	 */
	static memoryBudgetExceeded(
		currentUsage: number,
		budget: number,
		requestedSize: number
	): OverlayError {
		return new OverlayError(
			OverlayErrorCode.MEMORY_BUDGET_EXCEEDED,
			`Texture memory budget exceeded: ${currentUsage}/${budget} bytes (requested: ${requestedSize} bytes)`,
			{ currentUsage, budget, requestedSize },
			'Reduce the number of overlay elements or use smaller textures. To raise the ceiling, pass a larger `memoryBudget` in OverlayOptions.'
		);
	}

	/**
	 * Invalid element type or element issue
	 */
	static invalidElementType(elementId: string, reason: string): OverlayError {
		return new OverlayError(
			OverlayErrorCode.INVALID_ELEMENT_TYPE,
			`Invalid element '${elementId}': ${reason}`,
			{ elementId, reason },
			'Check element content, attributes, and ensure it is properly loaded and accessible.'
		);
	}

	/**
	 * Element not found in DOM
	 */
	static elementNotFound(elementId: string): OverlayError {
		// About the overlay's registry, not the DOM. Every producer fires when
		// a method is handed an id the overlay has no registration for — a
		// queued update racing an unregister, most often — and the old text
		// sent the reader to look at their markup.
		return new OverlayError(
			OverlayErrorCode.ELEMENT_NOT_FOUND,
			`No element is registered as '${elementId}'`,
			{ elementId },
			'Register the element before addressing it, and check for an unregisterElement() that ran first — a queued update can outlive the element it names.'
		);
	}

	/**
	 * Generic texture creation failure
	 */
	static textureCreationFailed(elementId: string, reason: string): OverlayError {
		return new OverlayError(
			OverlayErrorCode.TEXTURE_CREATION_FAILED,
			`Failed to create texture for element ${elementId}: ${reason}`,
			{ elementId, reason },
			'Check element content, ensure images are loaded, and verify WebGL context is valid.'
		);
	}

	/**
	 * Convert error to string with details and recovery suggestion
	 */
	toString(): string {
		let str = `[${this.code}] ${this.message}`;

		if (this.details && Object.keys(this.details).length > 0) {
			str += `\nDetails: ${JSON.stringify(this.details, null, 2)}`;
		}

		if (this.recovery) {
			str += `\n\nRecovery: ${this.recovery}`;
		}

		if (this.stack) {
			str += `\n\nStack trace:\n${this.stack}`;
		}

		return str;
	}

	/**
	 * Convert error to JSON object
	 *
	 * Useful for logging or sending to error tracking services
	 */
	toJSON(): Record<string, any> {
		return {
			code: this.code,
			message: this.message,
			details: this.details,
			recovery: this.recovery,
			stack: this.stack,
			name: this.name
		};
	}
}
