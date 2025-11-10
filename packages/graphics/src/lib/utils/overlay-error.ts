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
	TEXTURE_CREATION_FAILED = 'TEXTURE_CREATION_FAILED'
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

		// Maintains proper stack trace for where error was thrown (V8 only)
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, OverlayError);
		}
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
		return new OverlayError(
			OverlayErrorCode.TEXTURE_TOO_LARGE,
			`Texture size ${width}x${height} exceeds device maximum ${maxSize}x${maxSize} (element: ${elementId})${reason ? ': ' + reason : ''}`,
			{ elementId, width, height, maxSize, reason },
			'Reduce image size or enable auto-scaling. Consider using lower resolution images on mobile devices.'
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
			'Reduce number of overlay elements, use smaller textures, or increase memory budget with setMemoryBudget(). Consider implementing texture pooling to reuse memory.'
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
		return new OverlayError(
			OverlayErrorCode.ELEMENT_NOT_FOUND,
			`Element not found: ${elementId}`,
			{ elementId },
			'Ensure the element exists in the DOM before registering it with the overlay. Check element ID and timing.'
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
