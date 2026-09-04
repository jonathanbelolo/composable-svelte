/**
 * A nested schema's error lands on the field that caused it.
 *
 * `form.reducer.ts` routed Zod issues with `issue.path[0]`, so an issue at
 * `['address','zip']` was filed under `address`. Two consequences, both visible
 * to a user: the message could not be shown beside the input that produced it,
 * and the field it *did* name might not be on screen at all.
 *
 * **Nothing in this repository exercised that path.** Every schema reaching a
 * form was one level deep — the multi-step example runs two flat reducers
 * rather than one nested one, which is the workaround the old design forced. So
 * every test here is new, and none of them could have failed before the fix
 * because the situation never arose.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createTestStore } from '../src/lib/test/index.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/index.js';
import type { FormConfig } from '../src/lib/components/form/index.js';

const addressSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	address: z.object({
		zip: z.string().length(5, 'Zip must be 5 digits'),
		city: z.string().min(1, 'City is required')
	})
});
type AddressFields = z.infer<typeof addressSchema>;

const addressConfig: FormConfig<AddressFields> = {
	schema: addressSchema,
	initialData: { name: 'Ada', address: { zip: '', city: 'London' } },
	mode: 'onBlur',
	onSubmit: async () => {}
};

const itemsSchema = z.object({
	items: z.array(z.object({ name: z.string().min(1, 'Name required') })).min(1, 'At least one item')
});
type ItemFields = z.infer<typeof itemsSchema>;

const itemsConfig: FormConfig<ItemFields> = {
	schema: itemsSchema,
	initialData: { items: [{ name: 'ok' }, { name: '' }] },
	mode: 'onBlur',
	onSubmit: async () => {}
};

const makeStore = <T extends Record<string, any>>(config: FormConfig<T>) =>
	createTestStore({
		initialState: createInitialFormState(config),
		reducer: createFormReducer(config)
	});

describe('a nested error lands on the nested field', () => {
	it('G1: whole-form validation files it by full path', async () => {
		const store = makeStore(addressConfig);

		await store.send({ type: 'submitTriggered' });
		await store.receive({ type: 'formValidationStarted' });
		await store.receive({ type: 'formValidationCompleted' }, (state) => {
			expect(state.fields['address.zip']?.error).toBe('Zip must be 5 digits');
			// The parent must NOT also carry it. Filing an error on an ancestor is
			// exactly the defect: `address` is not an input the user can correct.
			expect(state.fields['address']?.error ?? null).toBeNull();
			expect(state.formErrors).toEqual([]);
		});
	});

	it('G2: per-field validation agrees with it', async () => {
		const store = makeStore(addressConfig);

		await store.send({ type: 'fieldBlurred', field: 'address.zip' });
		await store.receive({ type: 'fieldValidationStarted', field: 'address.zip' });
		await store.receive({ type: 'fieldValidationCompleted' }, (state) => {
			expect(state.fields['address.zip']?.error).toBe('Zip must be 5 digits');
			expect(state.fields['address']?.error ?? null).toBeNull();
		});
	});

	it('G3: an array element error names its index', async () => {
		const store = makeStore(itemsConfig);

		await store.send({ type: 'submitTriggered' });
		await store.receive({ type: 'formValidationStarted' });
		await store.receive({ type: 'formValidationCompleted' }, (state) => {
			expect(state.fields['items.1.name']?.error).toBe('Name required');
			// The sibling that is fine stays fine.
			expect(state.fields['items.0.name']?.error ?? null).toBeNull();
			// And it is a field error, not a form error. A numeric segment used to
			// fall through to `formErrors`, where nothing renders it.
			expect(state.formErrors).toEqual([]);
		});
	});

	it('G5: an error for a path with no record yet creates a complete one', async () => {
		// `address` is absent from the initial data, so nothing walked `address.zip`.
		const config: FormConfig<AddressFields> = {
			...addressConfig,
			initialData: { name: 'Ada' } as AddressFields
		};
		const store = makeStore(config);

		await store.send({ type: 'submitTriggered' });
		await store.receive({ type: 'formValidationStarted' });
		await store.receive({ type: 'formValidationCompleted' }, (state) => {
			// All five keys. The old code spread `undefined` into a new object and
			// produced a two-key record missing `warnings` and `isValidating`.
			expect(state.fields['address']).toEqual({
				touched: true,
				dirty: false,
				error: expect.any(String),
				isValidating: false,
				warnings: []
			});
		});
	});

	it('G7: a flat schema produces exactly the keys it always did', () => {
		const flat = z.object({ a: z.string(), b: z.string() });
		const store = makeStore({
			schema: flat,
			initialData: { a: '', b: '' },
			onSubmit: async () => {}
		});

		expect(Object.keys(store.state.fields)).toEqual(['a', 'b']);
	});

	it('G8: a Date is one field, not a bag of fields', () => {
		const schema = z.object({ when: z.date() });
		const store = makeStore({
			schema,
			initialData: { when: new Date() },
			onSubmit: async () => {}
		});

		const keys = Object.keys(store.state.fields);
		expect(keys).toContain('when');
		expect(keys.filter((k) => k.startsWith('when.'))).toEqual([]);
	});

	it('G11: a field named like an Object property is not confused for one', async () => {
		// `fields` is built with `Object.fromEntries`, which creates own data
		// properties — so `fields.constructor` is this field's record, not
		// `Object`. Building it by assignment onto `{}` would inherit instead.
		const schema = z.object({ constructor: z.string().min(3, 'too short') });
		const store = makeStore({
			schema,
			initialData: { constructor: 'a' },
			onSubmit: async () => {}
		});

		await store.send({ type: 'submitTriggered' });
		await store.receive({ type: 'formValidationStarted' });
		await store.receive({ type: 'formValidationCompleted' }, (state) => {
			expect(state.fields['constructor']?.error).toBe('too short');
		});
	});
});

describe('both validation paths choose the same message', () => {
	// The defect: per-field used `issues.find` (first issue) and whole-form
	// assigned in a loop (last issue won). So an all-whitespace email said
	// "Email is required" while typing and "Enter a valid email address" on
	// submit — same input, same schema, two answers.
	const schema = z.object({
		email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address')
	});
	const config: FormConfig<{ email: string }> = {
		schema,
		initialData: { email: '' },
		mode: 'all',
		onSubmit: async () => {}
	};
	const EXPECTED = 'Email is required';

	it('G4a: per-field reports the first issue', async () => {
		const store = makeStore(config);

		await store.send({ type: 'setFieldValue', field: 'email', value: '   ' });
		await store.send({ type: 'fieldBlurred', field: 'email' });
		await store.receive({ type: 'fieldValidationStarted', field: 'email' });
		await store.receive({ type: 'fieldValidationCompleted' }, (state) => {
			expect(state.fields.email?.error).toBe(EXPECTED);
		});
	});

	it('G4b: whole-form reports the first issue too', async () => {
		const store = makeStore(config);

		await store.send({ type: 'setFieldValue', field: 'email', value: '   ' });
		await store.send({ type: 'submitTriggered' });
		await store.receive({ type: 'formValidationStarted' });
		await store.receive({ type: 'formValidationCompleted' }, (state) => {
			expect(state.fields.email?.error).toBe(EXPECTED);
		});
	});

	it('G4c: and so the two agree', async () => {
		// The arm that fails if either path is changed alone. Both mutations —
		// reverting per-field to last-wins, or whole-form to last-wins — must
		// break this one while breaking exactly one of the two above.
		const perField = makeStore(config);
		await perField.send({ type: 'setFieldValue', field: 'email', value: '   ' });
		await perField.send({ type: 'fieldBlurred', field: 'email' });
		await perField.receive({ type: 'fieldValidationStarted', field: 'email' });
		await perField.receive({ type: 'fieldValidationCompleted' });

		const wholeForm = makeStore(config);
		await wholeForm.send({ type: 'setFieldValue', field: 'email', value: '   ' });
		await wholeForm.send({ type: 'submitTriggered' });
		await wholeForm.receive({ type: 'formValidationStarted' });
		await wholeForm.receive({ type: 'formValidationCompleted' });

		expect(perField.state.fields.email?.error).toBe(wholeForm.state.fields.email?.error);
	});
});
