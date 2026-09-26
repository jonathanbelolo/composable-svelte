import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createTestStore } from '../src/lib/test/test-store.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';
const config = (): FormConfig<{
	name: string;
}> => ({ schema: z.object({ name: z.string() }), initialData: { name: 'same' }, mode: 'onSubmit', onSubmit: vi.fn() });
describe('form validation lifetimes', () => {
	it('reset aborts field validator signal even when data returns to same value', async () => {
		const c = config();
		let signal: AbortSignal | undefined;
		let release!: () => void;
		c.asyncValidators = { name: async (_value, received?: AbortSignal) => { signal = received; await new Promise<void>(r => { release = r; }); throw Error('obsolete'); } };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c), dependencies: {} });
		await s.send({ type: 'fieldValidationStarted', field: 'name' });
		await s.send({ type: 'formReset' });
		expect(signal?.aborted).toBe(true);
		release();
		await s.finish();
		expect(s.state.fields.name!.error).toBeNull();
		s.destroy();
	});
	it('programmatic edit aborts active field work and clears validation indicator', async () => {
		const c = config();
		let signal: AbortSignal | undefined;
		let release!: () => void;
		c.asyncValidators = { name: async (_v, received?: AbortSignal) => { signal = received; await new Promise<void>(r => { release = r; }); } };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c), dependencies: {} });
		await s.send({ type: 'fieldValidationStarted', field: 'name' });
		await s.send({ type: 'setFieldValue', field: 'name', value: 'new' });
		expect(signal?.aborted).toBe(true);
		expect(s.state.fields.name!.isValidating).toBe(false);
		release();
		await s.finish();
		s.destroy();
	});
	it('same-operation snapshot mismatch unwinds validation without submission', () => {
		const c = config(), r = createFormReducer(c);
		const initial = createInitialFormState(c);
		const [active] = r(initial, { type: 'formValidationStarted' }, {});
		const replaced = { ...active, data: { name: 'parent replacement' } };
		const [done, effect] = r(replaced, { type: 'formValidationCompleted', validationId: active.validationId!, snapshot: initial.data, fieldErrors: {}, formErrors: [] }, {});
		expect(done.isValidating).toBe(false);
		expect(done.data.name).toBe('parent replacement');
		expect(effect._tag).toBe('None');
	});
	it('old completion cannot validate a reset field with identical data', () => {
		const c = config(), r = createFormReducer(c);
		let [state] = r(createInitialFormState(c), { type: 'fieldValidationStarted', field: 'name' }, {});
		const oldId = state.fields.name!.validationId!;
		[state] = r(state, { type: 'formReset' }, {});
		[state] = r(state, { type: 'fieldValidationStarted', field: 'name' }, {});
		expect(state.fields.name!.validationId).toBeGreaterThan(oldId);
		const [after] = r(state, { type: 'fieldValidationCompleted', field: 'name', validationId: oldId, error: 'obsolete' }, {});
		expect(after).toBe(state);
		expect(after.fields.name!.isValidating).toBe(true);
	});
	it('editing aborts full-form validator and prevents obsolete submit', async () => {
		const c = config();
		let signal: AbortSignal | undefined;
		let release!: () => void;
		c.asyncValidators = { name: async (_v, s) => { signal = s; await new Promise<void>(r => { release = r; }); } };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c), dependencies: {} });
		await s.send({ type: 'formValidationStarted' });
		await s.send({ type: 'fieldChanged', field: 'name', value: 'new' });
		expect(signal?.aborted).toBe(true);
		release();
		await s.finish();
		expect(c.onSubmit).not.toHaveBeenCalled();
		s.destroy();
	});
	it('per-field validator receives transformed output without rewriting typed input', async () => {
		const c = config();
		c.schema = z.object({ name: z.string().trim() });
		c.initialData = { name: ' same ' };
		const validator = vi.fn(async (_v: string) => { });
		c.asyncValidators = { name: validator };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c), dependencies: {} });
		await s.send({ type: 'fieldValidationStarted', field: 'name' });
		await s.receive({ type: 'fieldValidationCompleted', field: 'name', error: null });
		await s.finish();
		expect(validator).toHaveBeenCalledWith('same', expect.any(AbortSignal));
		expect(s.state.data.name).toBe(' same ');
		s.destroy();
	});
});
