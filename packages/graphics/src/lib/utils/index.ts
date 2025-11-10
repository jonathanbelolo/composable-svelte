/**
 * WebGLOverlay Utilities
 *
 * Phase 0: Foundation & Risk Mitigation
 *
 * These utilities handle production edge cases before feature development:
 * - WebGL context loss/recovery
 * - Texture size validation
 * - Device capabilities detection
 * - Structured error handling
 * - Browser compatibility
 * - Performance infrastructure
 * - Security & sanitization
 * - Graceful degradation
 */

// WebGL Context Management
export { WebGLContextManager } from './webgl-context-manager.js';

// Texture Validation
export {
	TextureValidator,
	type TextureValidationResult,
	type MemoryUsage
} from './texture-validator.js';

// Device Capabilities
export { DeviceCapabilities, type DeviceInfo } from './device-capabilities.js';

// Error Handling
export { OverlayError, OverlayErrorCode } from './overlay-error.js';

// Browser Compatibility
export {
	BrowserCompatibility,
	type BrowserType,
	type BrowserInfo
} from './browser-compatibility.js';

// Performance Infrastructure
export { RenderLoop, type RenderCallback } from './render-loop.js';

// Security & Sanitization
export { HTMLSanitizer, type SafetyCheckResult } from './html-sanitizer.js';

// Graceful Degradation
export {
	checkWebGLSupport,
	isWebGL2Supported,
	getWebGLCapabilities,
	logWebGLSupportInfo,
	getUnsupportedMessage,
	isWebGLLikelyDisabled,
	type WebGLSupportInfo
} from './webgl-support.js';
