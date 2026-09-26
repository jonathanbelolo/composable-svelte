import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import { createTestStore } from '../src/lib/test/test-store.js';
import type { FormConfig, FormAction } from '../src/lib/components/form/form.types.js';
const make = (): FormConfig<{
	email: string;
	name: string;
}> => ({ schema: z.object({ email: z.string().trim().toLowerCase(), name: z.string().min(1) }), initialData: { email: 'a@b.com', name: 'A' }, mode: 'onSubmit', onSubmit: vi.fn() });
describe('form review v3 regressions', () => {
	it('retains a pending email verdict while another field changes', async () => {
		const c = make();
		let reject!: (e: Error) => void;
		c.asyncValidators = { email: () => new Promise((_r, j) => { reject = j; }) };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'fieldValidationStarted', field: 'email' });
		await s.send({ type: 'fieldChanged', field: 'name', value: 'B' });
		reject(Error('taken'));
		await s.receive({ type: 'fieldValidationCompleted', field: 'email', error: 'taken' });
		await s.finish();
		expect(s.state.fields.email!.error).toBe('taken');
		s.destroy();
	});
	it('normalizes email for async validation even with invalid unrelated name', async () => {
		const c = make();
		c.initialData = { email: ' A@B.COM ', name: '' };
		const validator = vi.fn(async () => { });
		c.asyncValidators = { email: validator };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'fieldValidationStarted', field: 'email' });
		await s.receive({ type: 'fieldValidationCompleted', field: 'email', error: null });
		await s.finish();
		expect(validator).toHaveBeenCalledWith('a@b.com', expect.any(AbortSignal));
		s.destroy();
	});
	it('rejects parent replacement after approval on tagged and legacy completion paths', async () => {
		for (const tagged of [false, true]) {
			const c = make(), r = createFormReducer(c);
			const initial = { ...createInitialFormState(c), validationId: 1, isValidating: true };
			const [approved, effect] = r(initial, { type: 'formValidationCompleted', fieldErrors: {}, formErrors: [], data: initial.data, ...(tagged ? { validationId: 1 } : {}) }, {});
			const actions: FormAction<{
				email: string;
				name: string;
			}>[] = [];
			if (effect._tag !== 'Batch') throw Error('expected field cancellation then queued submit');
			expect(effect.effects.slice(0, -1).every(member => member._tag === 'Cancellable' && member.cancelOnly)).toBe(true);
			const queuedSubmit = effect.effects.at(-1);
			if (queuedSubmit?._tag !== 'Run') throw Error('expected queued submit');
			await queuedSubmit.execute(a => actions.push(a));
			const [next, submit] = r({ ...approved, data: { ...approved.data, email: 'unvalidated' } }, actions[0]!, {});
			expect(next.isSubmitting).toBe(false);
			expect(submit._tag).toBe('None');
			expect(c.onSubmit).not.toHaveBeenCalled();
		}
	});
	it('reset prevents old submission result and success callback from touching reset state', async () => {
		const c = make();
		let resolve!: () => void;
		c.onSubmit = () => new Promise<void>(r => { resolve = r; });
		c.onSubmitSuccess = vi.fn();
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'submissionStarted' });
		await s.send({ type: 'formReset' });
		resolve();
		await s.finish();
		expect(s.state.lastSubmitted).toBeNull();
		expect(c.onSubmitSuccess).not.toHaveBeenCalled();
		s.destroy();
	});
	it('schema verdict uses current cross-field state without losing async field errors', async () => {
		const c = make();
		c.schema = z.object({ email: z.string(), name: z.string() }).refine(d => d.name !== 'bad', { path: ['email'], message: 'name conflict' });
		let resolve!: () => void;
		c.asyncValidators = { email: () => new Promise<void>(r => { resolve = r; }) };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'fieldValidationStarted', field: 'email' });
		await s.send({ type: 'fieldChanged', field: 'name', value: 'bad' });
		resolve();
		await s.receive({ type: 'fieldValidationCompleted', field: 'email' });
		await s.finish();
		expect(s.state.fields.email!.error).toBe('name conflict');
		s.destroy();
	});
	it('latest submission wins while directly dispatched legacy terminal actions remain supported', async () => {
		const c = make();
		const releases: Array<() => void> = [];
		c.onSubmit = () => new Promise<void>(r => releases.push(r));
		c.onSubmitSuccess = vi.fn();
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'submissionStarted' });
		await s.send({ type: 'submissionStarted' });
		releases[0]!();
		await Promise.resolve();
		expect(s.state.isSubmitting).toBe(true);
		releases[1]!();
		await s.receive({ type: 'submissionSucceeded' });
		await s.finish();
		expect(c.onSubmitSuccess).toHaveBeenCalledTimes(1);
		expect(s.state.submitCount).toBe(1);
		const id = s.state.submissionId!;
		await s.send({ type: 'submissionSucceeded', submissionId: id });
		expect(s.state.submitCount).toBe(1);
		await s.send({ type: 'submissionFailed', error: 'legacy' });
		expect(s.state.submitError).toBe('legacy');
		expect(s.state.submitCount).toBe(2);
		s.destroy();
	});
	it('cancel and replacement debounce deliver exactly the last edit', async () => {
		const c = make();
		c.mode = 'onChange';
		c.debounceMs = 5;
		const validator = vi.fn(async () => { });
		c.asyncValidators = { email: validator };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'fieldChanged', field: 'email', value: 'first' });
		await s.send({ type: 'fieldChanged', field: 'email', value: 'last' });
		await s.receive({ type: 'fieldValidationStarted', field: 'email' });
		await s.receive({ type: 'fieldValidationCompleted', field: 'email' });
		await s.finish();
		expect(validator).toHaveBeenCalledTimes(1);
		expect(validator).toHaveBeenCalledWith('last', expect.any(AbortSignal));
		s.destroy();
	});
	it('marks invalidated submit approvals explicitly without automatic retry', async () => {
		const c = make(), r = createFormReducer(c);
		const [waiting] = r(createInitialFormState(c), { type: 'submitTriggered' }, {});
		const [edited] = r(waiting, { type: 'setFieldValue', field: 'email', value: 'new' }, {});
		expect(edited.submitOutcome).toBe('invalidated');
		expect(edited.isValidating).toBe(false);
		expect(c.onSubmit).not.toHaveBeenCalled();
	});
	it('arbitrary whole-object transforms defer partial custom validation instead of passing raw input', async () => {
		const c = make();
		c.schema = z.object({ email: z.string(), name: z.string().min(1) }).transform(d => ({ ...d, email: d.email.toLowerCase() }));
		c.initialData = { email: 'UPPER', name: '' };
		const validator = vi.fn(async () => { });
		c.asyncValidators = { email: validator };
		const s = createTestStore({ initialState: createInitialFormState(c), reducer: createFormReducer(c) });
		await s.send({ type: 'fieldValidationStarted', field: 'email' });
		await s.receive({ type: 'fieldValidationCompleted', field: 'email' });
		await s.finish();
		expect(validator).not.toHaveBeenCalled();
		s.destroy();
	});
	it('rechecks sibling schema clears against current data without clearing newer validation', () => {
		const c = make(), reducer = createFormReducer(c);
		const initial = createInitialFormState(c);
		const withError = { ...initial, fields: { ...initial.fields, email: { ...initial.fields.email!, error: 'old schema error' } } };
		const changed = { ...withError, data: { ...withError.data, name: 'other valid name' } };
		const completion: FormAction<{ email: string; name: string }> = { type: 'fieldValidationCompleted', field: 'email', validationId: 0, snapshot: initial.data, schemaOnly: true, error: null };
		const [cleared] = reducer(changed, completion, {});
		expect(cleared.fields.email!.error).toBeNull();
		const [validating] = reducer(changed, { type: 'fieldValidationStarted', field: 'email' }, {});
		const [untouched] = reducer(validating, completion, {});
		expect(untouched).toBe(validating);
		expect(untouched.fields.email!.isValidating).toBe(true);
	});

});
