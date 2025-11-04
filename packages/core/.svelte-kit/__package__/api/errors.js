// ============================================================================
// API Error Classes
// ============================================================================
/**
 * Base error class for all API-related errors.
 * Extends native Error with API-specific properties.
 */
export class APIError extends Error {
    constructor(message, status, body = null, headers = {}, isRetryable = false) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.body = body;
        this.headers = headers;
        this.isRetryable = isRetryable;
        // Maintain proper stack trace (V8 engines)
        if ('captureStackTrace' in Error) {
            Error.captureStackTrace(this, APIError);
        }
    }
    /**
     * Check if this is a client error (4xx status).
     */
    is4xx() {
        return this.status !== null && this.status >= 400 && this.status < 500;
    }
    /**
     * Check if this is a server error (5xx status).
     */
    is5xx() {
        return this.status !== null && this.status >= 500 && this.status < 600;
    }
    /**
     * Check if this is a network-level error (no response received).
     */
    isNetworkError() {
        return this.status === null;
    }
    /**
     * Serialize error to JSON for logging/debugging.
     * Redacts sensitive headers (Authorization, Cookie, etc.).
     */
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            status: this.status,
            body: this.body,
            headers: this._sanitizeHeaders(),
            isRetryable: this.isRetryable
        };
    }
    /**
     * Redact sensitive headers for safe logging.
     * @private
     */
    _sanitizeHeaders() {
        const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key', 'x-csrf-token'];
        const sanitized = {};
        const headerKeys = Object.keys(this.headers);
        for (let i = 0; i < headerKeys.length; i++) {
            const key = headerKeys[i];
            if (key !== undefined) {
                const value = this.headers[key];
                if (value !== undefined) {
                    const lowerKey = key.toLowerCase();
                    let isSensitive = false;
                    for (let j = 0; j < SENSITIVE_HEADERS.length; j++) {
                        const sensitiveHeader = SENSITIVE_HEADERS[j];
                        if (sensitiveHeader !== undefined && lowerKey === sensitiveHeader) {
                            isSensitive = true;
                            break;
                        }
                    }
                    sanitized[key] = isSensitive ? '***REDACTED***' : value;
                }
            }
        }
        return sanitized;
    }
}
// ============================================================================
// Network Error
// ============================================================================
/**
 * Error thrown when network request fails (no response received).
 * Includes fetch failures, CORS errors, DNS failures, etc.
 */
export class NetworkError extends APIError {
    constructor(message, cause) {
        super(message, null, // No status code for network errors
        null, // No response body
        {}, // No headers
        true // Network errors are retryable
        );
        this.name = 'NetworkError';
        if (cause !== undefined) {
            this.cause = cause;
        }
        if ('captureStackTrace' in Error) {
            Error.captureStackTrace(this, NetworkError);
        }
    }
    toJSON() {
        return {
            ...super.toJSON(),
            cause: this.cause?.message
        };
    }
}
// ============================================================================
// Timeout Error
// ============================================================================
/**
 * Error thrown when request exceeds configured timeout.
 */
export class TimeoutError extends APIError {
    constructor(timeout) {
        super(`Request timed out after ${timeout}ms`, null, // No status code for timeouts
        null, {}, true // Timeouts are retryable
        );
        this.name = 'TimeoutError';
        this.timeout = timeout;
        if ('captureStackTrace' in Error) {
            Error.captureStackTrace(this, TimeoutError);
        }
    }
    toJSON() {
        return {
            ...super.toJSON(),
            timeout: this.timeout
        };
    }
}
/**
 * Error thrown for validation failures (422 Unprocessable Entity).
 * Parses common validation error formats from various backends.
 */
export class ValidationError extends APIError {
    constructor(message, status, body, headers = {}) {
        super(message, status, body, headers, false // Validation errors are not retryable
        );
        this.name = 'ValidationError';
        this.errors = this._parseValidationErrors(body);
        if ('captureStackTrace' in Error) {
            Error.captureStackTrace(this, ValidationError);
        }
    }
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
    _parseValidationErrors(body) {
        if (!body || typeof body !== 'object') {
            return [];
        }
        const errors = [];
        const bodyObj = body;
        // JSON API format
        if (Array.isArray(bodyObj.errors)) {
            for (const err of bodyObj.errors) {
                if (typeof err === 'object' && err !== null) {
                    // JSON API format: { source: { pointer: "/data/attributes/email" }, detail: "..." }
                    if (err.source?.pointer && err.detail) {
                        const field = this._extractFieldFromPointer(err.source.pointer);
                        errors.push({
                            field,
                            message: err.detail,
                            code: err.code
                        });
                    }
                    // Generic array format: { field: "email", message: "...", code: "..." }
                    else if (err.field && err.message) {
                        errors.push({
                            field: err.field,
                            message: err.message,
                            code: err.code
                        });
                    }
                }
            }
        }
        // Rails/Laravel format: { errors: { email: ["is invalid"], name: ["is required"] } }
        else if (bodyObj.errors && typeof bodyObj.errors === 'object') {
            const errorFields = Object.keys(bodyObj.errors);
            for (let i = 0; i < errorFields.length; i++) {
                const field = errorFields[i];
                if (field !== undefined) {
                    const messages = bodyObj.errors[field];
                    if (Array.isArray(messages)) {
                        for (let j = 0; j < messages.length; j++) {
                            const message = messages[j];
                            if (typeof message === 'string') {
                                errors.push({ field, message });
                            }
                        }
                    }
                    else if (typeof messages === 'string') {
                        errors.push({ field, message: messages });
                    }
                }
            }
        }
        return errors;
    }
    /**
     * Extract field name from JSON API pointer.
     * Example: "/data/attributes/email" -> "email"
     *
     * @private
     */
    _extractFieldFromPointer(pointer) {
        const parts = pointer.split('/').filter(Boolean);
        return parts[parts.length - 1] || pointer;
    }
    /**
     * Get errors for a specific field.
     */
    getErrorsForField(field) {
        return this.errors.filter(e => e.field === field);
    }
    /**
     * Check if a specific field has errors.
     */
    hasErrorForField(field) {
        return this.errors.some(e => e.field === field);
    }
    toJSON() {
        return {
            ...super.toJSON(),
            errors: this.errors
        };
    }
}
