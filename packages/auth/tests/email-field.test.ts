/**
 * The one email rule, and every schema that is supposed to be using it.
 *
 * Extracting `emailField()` was meant to make four copies into one. Nothing
 * pinned that: reverting a single schema to its old inline
 * `z.string().min(1).email()` would have broken no test, because only
 * `magic-link-request` exercises an address through a flow. This asserts the
 * rule *and* its adoption, which is the property the extraction was for.
 */

import { describe, it, expect } from 'vitest';

import { emailField } from '../src/lib/flows/email-field.js';
import { loginSchema } from '../src/lib/flows/login/schema.js';
import { signupSchema } from '../src/lib/flows/signup/schema.js';
import { forgotPasswordSchema } from '../src/lib/flows/forgot-password/schema.js';
import { magicLinkSchema } from '../src/lib/flows/magic-link-request/schema.js';

const PASSWORD = 'correct-horse-battery-staple';

/** Enough of each schema's other fields to let the email rule be the subject. */
const SCHEMAS = [
	['login', loginSchema, { password: PASSWORD, rememberMe: false }],
	['signup', signupSchema, { password: PASSWORD, confirmPassword: PASSWORD }],
	['forgot-password', forgotPasswordSchema, {}],
	['magic-link-request', magicLinkSchema, {}]
] as const;

describe('emailField', () => {
	it('trims, and reports an empty address as required', () => {
		const schema = emailField();

		expect(schema.safeParse('  ada@example.com  ')).toMatchObject({
			success: true,
			data: 'ada@example.com'
		});
		expect(schema.safeParse('ada@example.com').success).toBe(true);
		expect(schema.safeParse('   ').success, 'whitespace is not an address').toBe(false);
		expect(schema.safeParse('').error?.issues[0]?.message).toBe('Email is required');
		expect(schema.safeParse('nope').success, 'accepted a non-address').toBe(false);
	});
});

describe('every schema that takes an address', () => {
	it.each(SCHEMAS.map(([name]) => name))('%s trims it', (name) => {
		const [, schema, rest] = SCHEMAS.find(([n]) => n === name)!;
		const result = schema.safeParse({ ...rest, email: '  ada@example.com  ' });

		expect(result.success, `${name} refused an address with whitespace`).toBe(true);
		expect(
			(result.data as { email: string } | undefined)?.email,
			`${name} is not using emailField()`
		).toBe('ada@example.com');
	});
});
