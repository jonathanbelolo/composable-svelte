/**
 * Simple Schema System for Query Parameter Validation
 *
 * This module provides a lightweight schema system for validating and coercing
 * query parameters. It's designed to be simple and framework-agnostic.
 *
 * Part of Phase 7.1: Query Parameter Support
 *
 * @module routing/schemas
 */
/**
 * String schema.
 *
 * Validates and coerces values to strings.
 *
 * @example
 * ```typescript
 * const schema = string({ minLength: 1, maxLength: 100 });
 * schema.parse('hello'); // → 'hello'
 * schema.parse(''); // → throws Error (minLength: 1)
 * ```
 */
export function string(options = {}) {
    return {
        parse(value) {
            // Handle default value
            if (value === undefined || value === null) {
                if (options.default !== undefined) {
                    return options.default;
                }
                throw new Error('Value is required');
            }
            // Convert to string
            const str = Array.isArray(value) ? value[0] : String(value);
            // Validate length
            if (options.minLength !== undefined && str.length < options.minLength) {
                throw new Error(`String must be at least ${options.minLength} characters`);
            }
            if (options.maxLength !== undefined && str.length > options.maxLength) {
                throw new Error(`String must be at most ${options.maxLength} characters`);
            }
            // Validate pattern
            if (options.pattern && !options.pattern.test(str)) {
                throw new Error(`String does not match pattern ${options.pattern}`);
            }
            // Validate enum
            if (options.enum && !options.enum.includes(str)) {
                throw new Error(`String must be one of: ${options.enum.join(', ')}`);
            }
            return str;
        }
    };
}
/**
 * Number schema.
 *
 * Validates and coerces values to numbers.
 *
 * @example
 * ```typescript
 * const schema = number({ min: 1, max: 100, integer: true });
 * schema.parse('42'); // → 42
 * schema.parse('3.14'); // → throws Error (integer: true)
 * schema.parse('0'); // → throws Error (min: 1)
 * ```
 */
export function number(options = {}) {
    return {
        parse(value) {
            // Handle default value
            if (value === undefined || value === null) {
                if (options.default !== undefined) {
                    return options.default;
                }
                throw new Error('Value is required');
            }
            // Convert to number
            const str = Array.isArray(value) ? value[0] : String(value);
            // Reject empty/whitespace strings (Number('') is 0, not NaN)
            if (str.trim() === '') {
                throw new Error('Number cannot be empty');
            }
            const num = Number(str);
            // Reject NaN and Infinity (Number.isFinite checks both)
            if (!Number.isFinite(num)) {
                throw new Error(`Invalid number: ${str}`);
            }
            // Validate integer
            if (options.integer && !Number.isInteger(num)) {
                throw new Error(`Number must be an integer: ${num}`);
            }
            // Validate range
            if (options.min !== undefined && num < options.min) {
                throw new Error(`Number must be at least ${options.min}`);
            }
            if (options.max !== undefined && num > options.max) {
                throw new Error(`Number must be at most ${options.max}`);
            }
            return num;
        }
    };
}
/**
 * Boolean schema.
 *
 * Validates and coerces values to booleans.
 *
 * Accepts: 'true', 'false', '1', '0', 'yes', 'no', 'on', 'off'
 *
 * @example
 * ```typescript
 * const schema = boolean();
 * schema.parse('true'); // → true
 * schema.parse('false'); // → false
 * schema.parse('1'); // → true
 * schema.parse('0'); // → false
 * schema.parse('invalid'); // → throws Error
 * ```
 */
export function boolean(options = {}) {
    return {
        parse(value) {
            // Handle default value
            if (value === undefined || value === null || value === '') {
                if (options.default !== undefined) {
                    return options.default;
                }
                throw new Error('Value is required');
            }
            // Convert to string and normalize
            const str = (Array.isArray(value) ? value[0] : String(value)).toLowerCase();
            // Parse boolean
            if (str === 'true' || str === '1' || str === 'yes' || str === 'on') {
                return true;
            }
            if (str === 'false' || str === '0' || str === 'no' || str === 'off') {
                return false;
            }
            throw new Error(`Invalid boolean value: ${str}`);
        }
    };
}
/**
 * Array schema.
 *
 * Validates and coerces values to arrays of a specific type.
 *
 * @template T - Element type
 * @param elementSchema - Schema for each array element
 *
 * @example
 * ```typescript
 * const schema = array(string());
 * schema.parse(['a', 'b', 'c']); // → ['a', 'b', 'c']
 * schema.parse('single'); // → ['single'] (normalized to array)
 * ```
 */
export function array(elementSchema, options = {}) {
    return {
        parse(value) {
            // Handle undefined
            if (value === undefined || value === null) {
                return [];
            }
            // Normalize to array
            const values = Array.isArray(value) ? value : [value];
            // Validate length
            if (options.minLength !== undefined && values.length < options.minLength) {
                throw new Error(`Array must have at least ${options.minLength} elements`);
            }
            if (options.maxLength !== undefined && values.length > options.maxLength) {
                throw new Error(`Array must have at most ${options.maxLength} elements`);
            }
            // Parse each element
            return values.map((v, i) => {
                try {
                    return elementSchema.parse(v);
                }
                catch (error) {
                    throw new Error(`Array element at index ${i}: ${error instanceof Error ? error.message : String(error)}`);
                }
            });
        }
    };
}
/**
 * Optional schema.
 *
 * Makes a schema optional (returns undefined if value is missing).
 *
 * @template T - Inner schema type
 * @param schema - Inner schema
 *
 * @example
 * ```typescript
 * const schema = optional(number({ min: 1 }));
 * schema.parse('42'); // → 42
 * schema.parse(undefined); // → undefined
 * schema.parse('0'); // → throws Error (min: 1)
 * ```
 */
export function optional(schema) {
    return {
        parse(value) {
            if (value === undefined || value === null || value === '') {
                return undefined;
            }
            return schema.parse(value);
        }
    };
}
/**
 * Enum schema.
 *
 * Validates that a value is one of the allowed values.
 *
 * @template T - Enum type
 * @param values - Allowed values
 *
 * @example
 * ```typescript
 * const schema = enumSchema(['asc', 'desc'] as const);
 * schema.parse('asc'); // → 'asc'
 * schema.parse('invalid'); // → throws Error
 * ```
 */
export function enumSchema(values, options = {}) {
    return {
        parse(value) {
            // Handle default value
            if (value === undefined || value === null || value === '') {
                if (options.default !== undefined) {
                    return options.default;
                }
                throw new Error('Value is required');
            }
            // Convert to string
            const str = Array.isArray(value) ? value[0] : String(value);
            // Validate enum
            if (!values.includes(str)) {
                throw new Error(`Value must be one of: ${values.join(', ')}`);
            }
            return str;
        }
    };
}
/**
 * Object schema.
 *
 * Validates and parses an object with typed fields.
 *
 * @template T - Object type
 * @param fields - Field schemas
 *
 * @example
 * ```typescript
 * const schema = object({
 *   search: optional(string()),
 *   page: optional(number({ min: 1 })),
 *   sort: optional(enumSchema(['asc', 'desc'] as const))
 * });
 *
 * const params = { search: 'laptop', page: '2', sort: 'asc' };
 * schema.parse(params);
 * // → { search: 'laptop', page: 2, sort: 'asc' }
 * ```
 */
export function object(fields) {
    return {
        parse(value) {
            if (typeof value !== 'object' || value === null) {
                throw new Error('Value must be an object');
            }
            const result = {};
            for (const [key, fieldSchema] of Object.entries(fields)) {
                try {
                    result[key] = fieldSchema.parse(value[key]);
                }
                catch (error) {
                    throw new Error(`Field "${key}": ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            return result;
        }
    };
}
/**
 * Literal schema.
 *
 * Validates that a value exactly matches a literal value.
 *
 * @template T - Literal type
 * @param literal - Expected literal value
 *
 * @example
 * ```typescript
 * const schema = literal('active');
 * schema.parse('active'); // → 'active'
 * schema.parse('inactive'); // → throws Error
 * ```
 */
export function literal(literal) {
    return {
        parse(value) {
            const str = Array.isArray(value) ? value[0] : String(value);
            let parsed;
            if (typeof literal === 'number') {
                // Number literal
                parsed = Number(str);
            }
            else if (typeof literal === 'boolean') {
                // Boolean literal - handle string to boolean conversion
                const lower = str.toLowerCase();
                if (lower === 'true' || lower === '1' || lower === 'yes' || lower === 'on') {
                    parsed = true;
                }
                else if (lower === 'false' || lower === '0' || lower === 'no' || lower === 'off') {
                    parsed = false;
                }
                else {
                    throw new Error(`Value must be ${literal}`);
                }
            }
            else {
                // String literal
                parsed = str;
            }
            if (parsed !== literal) {
                throw new Error(`Value must be ${literal}`);
            }
            return parsed;
        }
    };
}
