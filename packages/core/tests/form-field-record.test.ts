/**
 * The stored per-field record must not carry values it does not maintain.
 *
 * `FormState.fields[x]` was typed `FieldState`, which declares `value` and
 * (after the focus commit) `focused`. The reducer writes both exactly once, in
 * `createInitialFormState`, and never again:
 *
 *   - `value` — the real value lives in `state.data[x]`, which every case
 *     updates. `fields[x].value` is a second source of truth that is stale from
 *     the first keystroke. `FormField` already reads `$store.data[name]`, so
 *     nothing consumed the stale copy — it was purely a lie in the type.
 *   - `focused` — `FormField` derives it from the form-level `focusedField`.
 *     The stored one stays `false` forever.
 *
 * A consumer reading `store.state.fields.email` — the documented shape — got
 * two fields that were wrong. Splitting the stored record from the render
 * payload is what makes both honest.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createTestStore } from '../src/lib/test/test-store.js';
import {
	createFormReducer,
	createInitialFormState
} from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';

interface Data {
	name: string;
}

const config: FormConfig<Data> = {
	schema: z.object({ name: z.string().min(2, 'too short') }),
	initialData: { name: '' },
	onSubmit: async () => {}
};

const makeStore = () =>
	createTestStore({
		initialState: createInitialFormState(config),
		reducer: createFormReducer(config)
	});

describe('the stored field record', () => {
	it('carries no value of its own', async () => {
		const store = makeStore();

		await store.send({ type: 'fieldChanged', field: 'name', value: 'Ada' }, (state) => {
			expect(state.data.name, 'the real value').toBe('Ada');
			// The record must exist first. `fields` is keyed by path and partial,
			// so `'value' in undefined` would not compile — and `?? {}` would make
			// this pass for a field that was never created at all, which is the
			// vacuous-guard shape this file exists to argue against.
			const record = state.fields.name;
			expect(record, 'no record for `name`, so the check below proves nothing').toBeDefined();
			expect(
				'value' in record!,
				'fields.name.value is a second source of truth and goes stale immediately'
			).toBe(false);
		});
	});

	it('carries no focused flag of its own', async () => {
		const store = makeStore();

		await store.send({ type: 'fieldFocused', field: 'name' }, (state) => {
			expect(state.focusedField, 'the real answer').toBe('name');
			// The record must exist first. `fields` is keyed by path and partial,
			// so `'focused' in undefined` would not compile — and `?? {}` would make
			// this pass for a field that was never created at all, which is the
			// vacuous-guard shape this file exists to argue against.
			const record = state.fields.name;
			expect(record, 'no record for `name`, so the check below proves nothing').toBeDefined();
			expect(
				'focused' in record!,
				'fields.name.focused was written once as false and never updated'
			).toBe(false);
		});
	});
});
