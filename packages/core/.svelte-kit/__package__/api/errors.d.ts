/**
 * Base error class for all API-related errors.
 * Extends native Error with API-specific properties.
 */
export declare class APIError extends Error {
    /**
     * HTTP status code (e.g., 404, 500).
     * Null for network errors where no response was received.
     */
    readonly status: number | null;
    /**
     * Response body (if available).
     * May be JSON object, text, or null.
     */
    readonly body: unknown;
    /**
     * Response headers as key-value pairs.
     */
    readonly headers: Record<string, string>;
    /**
     * Whether this error is retryable.
     * Typically true for 5xx errors and network issues.
     */
    readonly isRetryable: boolean;
    constructor(message: string, status: number | null, body?: unknown, headers?: Record<string, string>, isRetryable?: boolean);
    /**
     * Check if this is a client error (4xx status).
     */
    is4xx(): boolean;
    /**
     * Check if this is a server error (5xx status).
     */
    is5xx(): boolean;
    /**
     * Check if this is a network-level error (no response received).
     */
    isNetworkError(): boolean;
    /**
     * Serialize error to JSON for logging/debugging.
     * Redacts sensitive headers (Authorization, Cookie, etc.).
     */
    toJSON(): Record<string, unknown>;
    /**
     * Redact sensitive headers for safe logging.
     * @private
     */
    private _sanitizeHeaders;
}
/**
 * Error thrown when network request fails (no response received).
 * Includes fetch failures, CORS errors, DNS failures, etc.
 */
export declare class NetworkError extends APIError {
    /**
     * Original error from fetch API (if available).
     */
    readonly cause?: Error;
    constructor(message: string, cause?: Error);
    toJSON(): Record<string, unknown>;
}
/**
 * Error thrown when request exceeds configured timeout.
 */
export declare class TimeoutError extends APIError {
    /**
     * Timeout duration in milliseconds.
     */
    readonly timeout: number;
    constructor(timeout: number);
    toJSON(): Record<string, unknown>;
}
/**
 * Validation error field details.
 */
export interface ValidationErrorField {
    /**
     * Field name/path (e.g., "email", "user.name").
     */
    field: string;
    /**
     * Error message for this field.
     */
    message: string;
    /**
     * Error code (optional, e.g., "required", "invalid_format").
     */
    code?: string;
}
/**
 * Error thrown for validation failures (422 Unprocessable Entity).
 * Parses common validation error formats from various backends.
 */
export declare class ValidationError extends APIError {
    /**
     * Validation errors by field.
     */
    readonly errors: ValidationErrorField[];
    constructor(message: string, status: number, body: unknown, headers?: Record<string, string>);
    /**
     * Parse validation errors from response body.
     * Supports common formats:
     * - JSON API: { errors: [{ source: { pointer: "/data/attributes/email" }, detail: "..." }] }
     * - Rails: { errors: { email: ["is invalid"] } }
     * - Laravel: { errors: { email: ["The email field is required."] } }
     * - Generic: { errors: [{ field: "email", message: "..." }] }
     *
     * @private
     */
    private _parseValidationErrors;
    /**
     * Extract field name from JSON API pointer.
     * Example: "/data/attributes/email" -> "email"
     *
     * @private
     */
    private _extractFieldFromPointer;
    /**
     * Get errors for a specific field.
     */
    getErrorsForField(field: string): ValidationErrorField[];
    /**
     * Check if a specific field has errors.
     */
    hasErrorForField(field: string): boolean;
    toJSON(): Record<string, unknown>;
}
//# sourceMappingURL=errors.d.ts.map