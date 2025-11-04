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
 * Base schema interface.
 *
 * All schemas must implement this interface.
 *
 * @template T - The output type after parsing
 */
export interface Schema<T> {
    /**
     * Parse and validate a raw value.
     *
     * @param value - Raw value from query string (string, string[], or undefined)
     * @returns Parsed and validated value
     * @throws Error if validation fails
     */
    parse(value: any): T;
}
/**
 * Options for string schema.
 */
export interface StringOptions {
    /** Minimum length (inclusive) */
    minLength?: number;
    /** Maximum length (inclusive) */
    maxLength?: number;
    /** Regular expression pattern to match */
    pattern?: RegExp;
    /** Allowed values (enum) */
    enum?: readonly string[];
    /** Default value if undefined */
    default?: string;
}
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
export declare function string(options?: StringOptions): Schema<string>;
/**
 * Options for number schema.
 */
export interface NumberOptions {
    /** Minimum value (inclusive) */
    min?: number;
    /** Maximum value (inclusive) */
    max?: number;
    /** Must be an integer */
    integer?: boolean;
    /** Default value if undefined */
    default?: number;
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
export declare function number(options?: NumberOptions): Schema<number>;
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
export declare function boolean(options?: {
    default?: boolean;
}): Schema<boolean>;
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
export declare function array<T>(elementSchema: Schema<T>, options?: {
    minLength?: number;
    maxLength?: number;
}): Schema<T[]>;
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
export declare function optional<T>(schema: Schema<T>): Schema<T | undefined>;
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
export declare function enumSchema<T extends readonly string[]>(values: T, options?: {
    default?: T[number];
}): Schema<T[number]>;
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
export declare function object<T extends Record<string, any>>(fields: {
    [K in keyof T]: Schema<T[K]>;
}): Schema<T>;
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
export declare function literal<T extends string | number | boolean>(literal: T): Schema<T>;
//# sourceMappingURL=schemas.d.ts.map