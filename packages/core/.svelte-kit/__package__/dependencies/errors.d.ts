/**
 * Error types for dependency-related failures.
 * Provides specific error classes with contextual information.
 */
/**
 * Base error for all dependency-related errors.
 */
export declare class DependencyError extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
/**
 * Storage quota exceeded error.
 * Thrown when attempting to store data exceeds available space.
 */
export declare class StorageQuotaExceededError extends DependencyError {
    readonly key: string;
    readonly attemptedSize: number;
    readonly availableSpace: number | null;
    constructor(key: string, attemptedSize: number, availableSpace: number | null);
}
/**
 * Invalid JSON parse error.
 * Thrown when stored data cannot be parsed as JSON.
 */
export declare class InvalidJSONError extends DependencyError {
    readonly key: string;
    readonly rawValue: string;
    readonly parseError: Error;
    constructor(key: string, rawValue: string, parseError: Error);
}
/**
 * Schema validation error.
 * Thrown when stored data doesn't match expected schema.
 */
export declare class SchemaValidationError extends DependencyError {
    readonly key: string;
    readonly value: unknown;
    readonly validationErrors: string[];
    constructor(key: string, value: unknown, validationErrors: string[]);
}
/**
 * Cookie size exceeded error.
 * Thrown when cookie exceeds 4KB limit.
 */
export declare class CookieSizeExceededError extends DependencyError {
    readonly key: string;
    readonly size: number;
    constructor(key: string, size: number);
}
/**
 * Environment not supported error.
 * Thrown when feature is unavailable in current environment (e.g., SSR).
 */
export declare class EnvironmentNotSupportedError extends DependencyError {
    readonly feature: string;
    readonly environment: string;
    constructor(feature: string, environment: string);
}
//# sourceMappingURL=errors.d.ts.map