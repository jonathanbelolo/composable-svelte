import { describe, it, expect } from 'vitest';
import {
  APIError,
  NetworkError,
  TimeoutError,
  ValidationError,
  type ValidationErrorField
} from '../../src/lib/api/errors.js';

// ============================================================================
// APIError Tests
// ============================================================================

describe('APIError', () => {
  describe('constructor', () => {
    it('creates error with all properties', () => {
      const error = new APIError(
        'Not found',
        404,
        { error: 'Resource not found' },
        { 'content-type': 'application/json' },
        false
      );

      expect(error.name).toBe('APIError');
      expect(error.message).toBe('Not found');
      expect(error.status).toBe(404);
      expect(error.body).toEqual({ error: 'Resource not found' });
      expect(error.headers).toEqual({ 'content-type': 'application/json' });
      expect(error.isRetryable).toBe(false);
    });

    it('uses defaults for optional parameters', () => {
      const error = new APIError('Server error', 500);

      expect(error.body).toBe(null);
      expect(error.headers).toEqual({});
      expect(error.isRetryable).toBe(false);
    });

    it('preserves stack trace', () => {
      const error = new APIError('Test error', 500);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('APIError');
    });
  });

  describe('is4xx()', () => {
    it('returns true for 4xx status codes', () => {
      expect(new APIError('', 400).is4xx()).toBe(true);
      expect(new APIError('', 404).is4xx()).toBe(true);
      expect(new APIError('', 422).is4xx()).toBe(true);
      expect(new APIError('', 499).is4xx()).toBe(true);
    });

    it('returns false for non-4xx status codes', () => {
      expect(new APIError('', 200).is4xx()).toBe(false);
      expect(new APIError('', 399).is4xx()).toBe(false);
      expect(new APIError('', 500).is4xx()).toBe(false);
      expect(new APIError('', null).is4xx()).toBe(false);
    });
  });

  describe('is5xx()', () => {
    it('returns true for 5xx status codes', () => {
      expect(new APIError('', 500).is5xx()).toBe(true);
      expect(new APIError('', 502).is5xx()).toBe(true);
      expect(new APIError('', 503).is5xx()).toBe(true);
      expect(new APIError('', 599).is5xx()).toBe(true);
    });

    it('returns false for non-5xx status codes', () => {
      expect(new APIError('', 200).is5xx()).toBe(false);
      expect(new APIError('', 404).is5xx()).toBe(false);
      expect(new APIError('', 499).is5xx()).toBe(false);
      expect(new APIError('', 600).is5xx()).toBe(false);
      expect(new APIError('', null).is5xx()).toBe(false);
    });
  });

  describe('isNetworkError()', () => {
    it('returns true when status is null', () => {
      expect(new APIError('', null).isNetworkError()).toBe(true);
    });

    it('returns false when status is not null', () => {
      expect(new APIError('', 404).isNetworkError()).toBe(false);
      expect(new APIError('', 500).isNetworkError()).toBe(false);
    });
  });

  describe('toJSON()', () => {
    it('serializes error with all properties', () => {
      const error = new APIError(
        'Server error',
        500,
        { error: 'Internal error' },
        { 'x-request-id': 'abc123' },
        true
      );

      expect(error.toJSON()).toEqual({
        name: 'APIError',
        message: 'Server error',
        status: 500,
        body: { error: 'Internal error' },
        headers: { 'x-request-id': 'abc123' },
        isRetryable: true
      });
    });

    it('redacts sensitive headers', () => {
      const error = new APIError(
        'Unauthorized',
        401,
        null,
        {
          'Authorization': 'Bearer secret-token',
          'Cookie': 'session=abc123',
          'X-API-Key': 'key-12345',
          'X-CSRF-Token': 'csrf-token',
          'Content-Type': 'application/json'
        }
      );

      const json = error.toJSON();
      expect(json.headers).toEqual({
        'Authorization': '***REDACTED***',
        'Cookie': '***REDACTED***',
        'X-API-Key': '***REDACTED***',
        'X-CSRF-Token': '***REDACTED***',
        'Content-Type': 'application/json'
      });
    });

    it('handles case-insensitive header matching', () => {
      const error = new APIError(
        'Error',
        401,
        null,
        {
          'authorization': 'Bearer token',
          'AUTHORIZATION': 'Bearer token2',
          'Authorization': 'Bearer token3'
        }
      );

      const json = error.toJSON();
      expect(json.headers).toEqual({
        'authorization': '***REDACTED***',
        'AUTHORIZATION': '***REDACTED***',
        'Authorization': '***REDACTED***'
      });
    });
  });
});

// ============================================================================
// NetworkError Tests
// ============================================================================

describe('NetworkError', () => {
  describe('constructor', () => {
    it('creates error with message only', () => {
      const error = new NetworkError('Network request failed');

      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Network request failed');
      expect(error.status).toBe(null);
      expect(error.body).toBe(null);
      expect(error.headers).toEqual({});
      expect(error.isRetryable).toBe(true);
      expect(error.cause).toBeUndefined();
    });

    it('creates error with cause', () => {
      const originalError = new Error('DNS lookup failed');
      const error = new NetworkError('Network request failed', originalError);

      expect(error.cause).toBe(originalError);
    });

    it('preserves stack trace', () => {
      const error = new NetworkError('Network error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('NetworkError');
    });
  });

  describe('toJSON()', () => {
    it('includes cause message', () => {
      const originalError = new Error('CORS error');
      const error = new NetworkError('Network request failed', originalError);

      expect(error.toJSON()).toEqual({
        name: 'NetworkError',
        message: 'Network request failed',
        status: null,
        body: null,
        headers: {},
        isRetryable: true,
        cause: 'CORS error'
      });
    });

    it('handles missing cause', () => {
      const error = new NetworkError('Network request failed');

      expect(error.toJSON()).toEqual({
        name: 'NetworkError',
        message: 'Network request failed',
        status: null,
        body: null,
        headers: {},
        isRetryable: true,
        cause: undefined
      });
    });
  });
});

// ============================================================================
// TimeoutError Tests
// ============================================================================

describe('TimeoutError', () => {
  describe('constructor', () => {
    it('creates error with timeout duration', () => {
      const error = new TimeoutError(5000);

      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Request timed out after 5000ms');
      expect(error.timeout).toBe(5000);
      expect(error.status).toBe(null);
      expect(error.isRetryable).toBe(true);
    });

    it('preserves stack trace', () => {
      const error = new TimeoutError(3000);
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TimeoutError');
    });
  });

  describe('toJSON()', () => {
    it('includes timeout duration', () => {
      const error = new TimeoutError(10000);

      expect(error.toJSON()).toEqual({
        name: 'TimeoutError',
        message: 'Request timed out after 10000ms',
        status: null,
        body: null,
        headers: {},
        isRetryable: true,
        timeout: 10000
      });
    });
  });
});

// ============================================================================
// ValidationError Tests
// ============================================================================

describe('ValidationError', () => {
  describe('constructor', () => {
    it('creates error with basic properties', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        { errors: { email: ['is required'] } }
      );

      expect(error.name).toBe('ValidationError');
      expect(error.message).toBe('Validation failed');
      expect(error.status).toBe(422);
      expect(error.isRetryable).toBe(false);
    });

    it('parses Rails/Laravel format (object with arrays)', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: {
            email: ['is required', 'must be valid'],
            name: ['is too short']
          }
        }
      );

      expect(error.errors).toEqual([
        { field: 'email', message: 'is required' },
        { field: 'email', message: 'must be valid' },
        { field: 'name', message: 'is too short' }
      ]);
    });

    it('parses Rails/Laravel format (object with strings)', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: {
            email: 'is required',
            name: 'is too short'
          }
        }
      );

      expect(error.errors).toEqual([
        { field: 'email', message: 'is required' },
        { field: 'name', message: 'is too short' }
      ]);
    });

    it('parses JSON API format', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: [
            {
              source: { pointer: '/data/attributes/email' },
              detail: 'Email is required',
              code: 'required'
            },
            {
              source: { pointer: '/data/attributes/user/name' },
              detail: 'Name is too short',
              code: 'min_length'
            }
          ]
        }
      );

      expect(error.errors).toEqual([
        { field: 'email', message: 'Email is required', code: 'required' },
        { field: 'name', message: 'Name is too short', code: 'min_length' }
      ]);
    });

    it('parses generic array format', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: [
            { field: 'email', message: 'Email is required', code: 'required' },
            { field: 'password', message: 'Password is too weak' }
          ]
        }
      );

      expect(error.errors).toEqual([
        { field: 'email', message: 'Email is required', code: 'required' },
        { field: 'password', message: 'Password is too weak' }
      ]);
    });

    it('handles empty errors', () => {
      expect(new ValidationError('', 422, null).errors).toEqual([]);
      expect(new ValidationError('', 422, {}).errors).toEqual([]);
      expect(new ValidationError('', 422, { errors: [] }).errors).toEqual([]);
      expect(new ValidationError('', 422, { errors: {} }).errors).toEqual([]);
    });

    it('handles malformed error objects gracefully', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: [
            { field: 'email' }, // Missing message
            { message: 'error' }, // Missing field
            'invalid', // Not an object
            null // Null value
          ]
        }
      );

      expect(error.errors).toEqual([]);
    });
  });

  describe('getErrorsForField()', () => {
    it('returns errors for specific field', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: {
            email: ['is required', 'must be valid'],
            name: ['is too short']
          }
        }
      );

      expect(error.getErrorsForField('email')).toEqual([
        { field: 'email', message: 'is required' },
        { field: 'email', message: 'must be valid' }
      ]);

      expect(error.getErrorsForField('name')).toEqual([
        { field: 'name', message: 'is too short' }
      ]);

      expect(error.getErrorsForField('nonexistent')).toEqual([]);
    });
  });

  describe('hasErrorForField()', () => {
    it('checks if field has errors', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        {
          errors: {
            email: ['is required'],
            name: ['is too short']
          }
        }
      );

      expect(error.hasErrorForField('email')).toBe(true);
      expect(error.hasErrorForField('name')).toBe(true);
      expect(error.hasErrorForField('nonexistent')).toBe(false);
    });
  });

  describe('toJSON()', () => {
    it('includes parsed errors', () => {
      const error = new ValidationError(
        'Validation failed',
        422,
        { errors: { email: ['is required'] } }
      );

      const json = error.toJSON();
      expect(json.errors).toEqual([
        { field: 'email', message: 'is required' }
      ]);
    });
  });
});

// ============================================================================
// Error Inheritance Tests
// ============================================================================

describe('Error inheritance', () => {
  it('all errors extend Error', () => {
    expect(new APIError('', 500) instanceof Error).toBe(true);
    expect(new NetworkError('') instanceof Error).toBe(true);
    expect(new TimeoutError(1000) instanceof Error).toBe(true);
    expect(new ValidationError('', 422, null) instanceof Error).toBe(true);
  });

  it('all errors extend APIError', () => {
    expect(new NetworkError('') instanceof APIError).toBe(true);
    expect(new TimeoutError(1000) instanceof APIError).toBe(true);
    expect(new ValidationError('', 422, null) instanceof APIError).toBe(true);
  });

  it('can distinguish error types with instanceof', () => {
    const apiError = new APIError('', 500);
    const networkError = new NetworkError('');
    const timeoutError = new TimeoutError(1000);
    const validationError = new ValidationError('', 422, null);

    expect(networkError instanceof NetworkError).toBe(true);
    expect(networkError instanceof TimeoutError).toBe(false);

    expect(timeoutError instanceof TimeoutError).toBe(true);
    expect(timeoutError instanceof NetworkError).toBe(false);

    expect(validationError instanceof ValidationError).toBe(true);
    expect(validationError instanceof NetworkError).toBe(false);

    expect(apiError instanceof NetworkError).toBe(false);
    expect(apiError instanceof TimeoutError).toBe(false);
    expect(apiError instanceof ValidationError).toBe(false);
  });
});
