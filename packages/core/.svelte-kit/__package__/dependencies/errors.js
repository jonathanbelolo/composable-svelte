/**
 * Error types for dependency-related failures.
 * Provides specific error classes with contextual information.
 */
/**
 * Base error for all dependency-related errors.
 */
export class DependencyError extends Error {
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = 'DependencyError';
    }
}
/**
 * Storage quota exceeded error.
 * Thrown when attempting to store data exceeds available space.
 */
export class StorageQuotaExceededError extends DependencyError {
    constructor(key, attemptedSize, availableSpace) {
        super(`Storage quota exceeded when setting key "${key}". Attempted: ${attemptedSize} bytes, Available: ${availableSpace ?? 'unknown'}`, 'QUOTA_EXCEEDED');
        this.key = key;
        this.attemptedSize = attemptedSize;
        this.availableSpace = availableSpace;
        this.name = 'StorageQuotaExceededError';
    }
}
/**
 * Invalid JSON parse error.
 * Thrown when stored data cannot be parsed as JSON.
 */
export class InvalidJSONError extends DependencyError {
    constructor(key, rawValue, parseError) {
        super(`Failed to parse JSON for key "${key}": ${parseError.message}`, 'INVALID_JSON');
        this.key = key;
        this.rawValue = rawValue;
        this.parseError = parseError;
        this.name = 'InvalidJSONError';
    }
}
/**
 * Schema validation error.
 * Thrown when stored data doesn't match expected schema.
 */
export class SchemaValidationError extends DependencyError {
    constructor(key, value, validationErrors) {
        super(`Schema validation failed for key "${key}": ${validationErrors.join(', ')}`, 'SCHEMA_VALIDATION_FAILED');
        this.key = key;
        this.value = value;
        this.validationErrors = validationErrors;
        this.name = 'SchemaValidationError';
    }
}
/**
 * Cookie size exceeded error.
 * Thrown when cookie exceeds 4KB limit.
 */
export class CookieSizeExceededError extends DependencyError {
    constructor(key, size) {
        super(`Cookie "${key}" exceeds 4KB limit (${size} bytes)`, 'COOKIE_SIZE_EXCEEDED');
        this.key = key;
        this.size = size;
        this.name = 'CookieSizeExceededError';
    }
}
/**
 * Environment not supported error.
 * Thrown when feature is unavailable in current environment (e.g., SSR).
 */
export class EnvironmentNotSupportedError extends DependencyError {
    constructor(feature, environment) {
        super(`${feature} is not available in ${environment} environment`, 'ENVIRONMENT_NOT_SUPPORTED');
        this.feature = feature;
        this.environment = environment;
        this.name = 'EnvironmentNotSupportedError';
    }
}
