/**
 * The exported validator helpers did not match the validator contract.
 *
 * `ConnectionValidator` is called with five positional arguments
 * (`node-canvas/reducer.ts:221-227`), but `strictValidator` was declared
 * `(error = 'Connections not allowed')`. Passing it as `validateConnection`
 * therefore hands the whole `NodeCanvasState` in as `error`, and the object
 * ends up in the returned `ConnectionValidation`.
 *
 * `strictFunctionTypes` means TypeScript rejects the assignment outright, so
 * the practical defect is that a publicly exported helper — and the
 * `composeValidators(strictValidator, …)` example in the package README — is
 * unusable rather than silently wrong. Either way it does not do what it says.
 *
 * `permissiveValidator` worked only by accident: a zero-arity function is
 * assignable to anything, and it ignores every argument.
 */

import { describe, it, expect } from 'vitest';
import {
	permissiveValidator,
	strictValidator,
	createStrictValidator,
	composeValidators
} from '../src/lib/node-canvas/validation';
import { createInitialNodeCanvasState } from '../src/lib/node-canvas/types';
import type { ConnectionValidator } from '../src/lib/node-canvas/types';

const state = createInitialNodeCanvasState();

describe('the exported connection validators', () => {
	it('strictValidator satisfies the ConnectionValidator contract', () => {
		// The load-bearing line: this assignment is what failed to compile.
		const validator: ConnectionValidator = strictValidator;
		const result = validator(state, 'a', null, 'b', null);

		expect(result.valid).toBe(false);
		expect(
			typeof result.error,
			'error received a positional argument instead of a message'
		).toBe('string');
		expect(result.error).toBe('Connections not allowed');
	});

	it('permissiveValidator satisfies it too', () => {
		const validator: ConnectionValidator = permissiveValidator;
		expect(validator(state, 'a', null, 'b', null)).toEqual({ valid: true });
	});

	it('createStrictValidator carries a custom message', () => {
		const validator = createStrictValidator('no wiring allowed');
		expect(validator(state, 'a', null, 'b', null)).toEqual({
			valid: false,
			error: 'no wiring allowed'
		});
	});

	it('composeValidators accepts them, as the README shows', () => {
		// `composeValidators(strictValidator, customValidator)` is the package
		// README's own example and did not compile.
		const composed = composeValidators(permissiveValidator, strictValidator);
		const result = composed(state, 'a', null, 'b', null);

		expect(result.valid).toBe(false);
		expect(result.error).toBe('Connections not allowed');
	});
});
