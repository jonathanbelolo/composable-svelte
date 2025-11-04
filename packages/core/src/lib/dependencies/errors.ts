/**
 * Error types for dependency-related failures.
 * Provides specific error classes with contextual information.
 */

/**
 * Base error for all dependency-related errors.
 */
export class DependencyError extends Error {
	constructor(
		message: string,
		public readonly code: string
	) {
		super(message);
		this.name = 'DependencyError';
	}
}

/**
 * Storage quota exceeded error.
 * Thrown when attempting to store data exceeds available space.
 */
export class StorageQuotaExceededError extends DependencyError {
	constructor(
		public readonly key: string,
		public readonly attemptedSize: number,
		public readonly availableSpace: number | null
	) {
		super(
			`Storage quota exceeded when setting key "${key}". Attempted: ${attemptedSize} bytes, Available: ${
				availableSpace ?? 'unknown'
			}`,
			'QUOTA_EXCEEDED'
		);
		this.name = 'StorageQuotaExceededError';
	}
}

/**
 * Invalid JSON parse error.
 * Thrown when stored data cannot be parsed as JSON.
 */
export class InvalidJSONError extends DependencyError {
	constructor(
		public readonly key: string,
		public readonly rawValue: string,
		public readonly parseError: Error
	) {
		super(`Failed to parse JSON for key "${key}": ${parseError.message}`, 'INVALID_JSON');
		this.name = 'InvalidJSONError';
	}
}

/**
 * Schema validation error.
 * Thrown when stored data doesn't match expected schema.
 */
export class SchemaValidationError extends DependencyError {
	constructor(
		public readonly key: string,
		public readonly value: unknown,
		public readonly validationErrors: string[]
	) {
		super(
			`Schema validation failed for key "${key}": ${validationErrors.join(', ')}`,
			'SCHEMA_VALIDATION_FAILED'
		);
		this.name = 'SchemaValidationError';
	}
}

/**
 * Cookie size exceeded error.
 * Thrown when cookie exceeds 4KB limit.
 */
export class CookieSizeExceededError extends DependencyError {
	constructor(
		public readonly key: string,
		public readonly size: number
	) {
		super(`Cookie "${key}" exceeds 4KB limit (${size} bytes)`, 'COOKIE_SIZE_EXCEEDED');
		this.name = 'CookieSizeExceededError';
	}
}

/**
 * Environment not supported error.
 * Thrown when feature is unavailable in current environment (e.g., SSR).
 */
export class EnvironmentNotSupportedError extends DependencyError {
	constructor(
		public readonly feature: string,
		public readonly environment: string
	) {
		super(
			`${feature} is not available in ${environment} environment`,
			'ENVIRONMENT_NOT_SUPPORTED'
		);
		this.name = 'EnvironmentNotSupportedError';
	}
}
