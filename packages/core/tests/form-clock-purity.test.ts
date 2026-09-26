import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import { createTestStore } from '../src/lib/test/test-store.js';
import {
	createFormReducer,
	createInitialFormState
} from '../src/lib/components/form/form.reducer.js';
import type {
	FormState,
	FormConfig,
	FormAction
} from '../src/lib/components/form/form.types.js';

const stores: Array<{ destroy(): void }> = [];
afterEach(() => { for (const store of stores.splice(0)) store.destroy(); vi.useRealTimers(); });

const testSchema = z.object({
	name: z.string().min(1, 'Name required')
});

type TestData = z.infer<typeof testSchema>;

function createTestConfig(overrides: Partial<FormConfig<TestData>> = {}): FormConfig<TestData> {
	return {
		schema: testSchema,
		initialData: { name: 'Ada' },
		mode: 'onSubmit',
		onSubmit: vi.fn(async () => {}),
		...overrides
	};
}

describe('NEW-FORM-CLOCK-001 Form clock purity & submission timestamping', () => {
	describe('Pure Reducer Semantics', () => {
		it('identical action replay independent ambient clock', () => {
			const config = createTestConfig();
			const reducer = createFormReducer(config);
			const fixedDate = new Date('2025-01-01T12:00:00.000Z');

			const submittingState: FormState<TestData> = {
				...createInitialFormState(config),
				isSubmitting: true,
				submissionId: 1
			};

			const successAction: FormAction<TestData> = {
				type: 'submissionSucceeded',
				submissionId: 1,
				submittedAt: fixedDate
			};

			vi.useFakeTimers();
			try {
				vi.setSystemTime(new Date('2020-01-01T00:00:00.000Z'));
				const [state1] = reducer(submittingState, successAction, {});

				vi.setSystemTime(new Date('2030-01-01T00:00:00.000Z'));
				const [state2] = reducer(submittingState, successAction, {});

				expect(state1.lastSubmitted).toBe(fixedDate);
				expect(state2.lastSubmitted).toBe(fixedDate);
				expect(state1).toEqual(state2);
			} finally {
				vi.useRealTimers();
			}
		});

		it('no clock during reducer construction or transition', () => {
			const now = vi.fn(() => new Date('2025-02-01T00:00:00.000Z'));
			const config = createTestConfig({ now });

			const reducer = createFormReducer(config);
			expect(now).not.toHaveBeenCalled();

			const state = createInitialFormState(config);

			const [s1] = reducer(state, { type: 'fieldChanged', field: 'name', value: 'Bob' }, {});
			const [s2] = reducer(s1, { type: 'fieldBlurred', field: 'name' }, {});
			const [s3] = reducer(s2, { type: 'submitTriggered' }, {});
			const [s4] = reducer(s3, { type: 'formValidationStarted', validationId: s3.validationId }, {});
			const [s5] = reducer(
				s4,
				{
					type: 'formValidationCompleted',
					validationId: s4.validationId,
					fieldErrors: {},
					formErrors: [],
					snapshot: s4.data
				},
				{}
			);
			const [s6] = reducer(s5, { type: 'submissionStarted', validationId: s5.validationId, snapshot: s5.data }, {});
			const [s7] = reducer(
				s6,
				{
					type: 'submissionSucceeded',
					submissionId: s6.submissionId,
					submittedAt: new Date('2025-02-01T00:00:00.000Z')
				},
				{}
			);
			const [s8] = reducer(s7, { type: 'formReset' }, {});

			expect(now).not.toHaveBeenCalled();
			expect(s7.lastSubmitted).toEqual(new Date('2025-02-01T00:00:00.000Z'));
			expect(s8.lastSubmitted).toBe(null);
		});

		it('missing timestamp sets lastSubmitted to null', () => {
			const config = createTestConfig();
			const reducer = createFormReducer(config);
			const priorDate = new Date('2024-05-01T00:00:00.000Z');

			const submittingState: FormState<TestData> = {
				...createInitialFormState(config),
				isSubmitting: true,
				submissionId: 5,
				lastSubmitted: priorDate
			};

			const [nextState] = reducer(
				submittingState,
				{ type: 'submissionSucceeded', submissionId: 5 },
				{}
			);

			expect(nextState.isSubmitting).toBe(false);
			expect(nextState.submitOutcome).toBe('succeeded');
			expect(nextState.lastSubmitted).toBe(null);
			expect(nextState.submitCount).toBe(1);
		});

		it('legacy untagged completion lacking timestamp succeeds with null lastSubmitted', () => {
			const config = createTestConfig();
			const reducer = createFormReducer(config);

			const submittingState: FormState<TestData> = {
				...createInitialFormState(config),
				isSubmitting: true
			};

			const [nextState] = reducer(
				submittingState,
				{ type: 'submissionSucceeded' },
				{}
			);

			expect(nextState.isSubmitting).toBe(false);
			expect(nextState.submitOutcome).toBe('succeeded');
			expect(nextState.lastSubmitted).toBe(null);
		});

		it('stale completion preserves prior timestamp and state', () => {
			const config = createTestConfig();
			const reducer = createFormReducer(config);
			const priorDate = new Date('2024-01-01T00:00:00.000Z');

			const activeState: FormState<TestData> = {
				...createInitialFormState(config),
				isSubmitting: true,
				submissionId: 2,
				lastSubmitted: priorDate
			};

			const staleAction: FormAction<TestData> = {
				type: 'submissionSucceeded',
				submissionId: 1,
				submittedAt: new Date('2024-02-01T00:00:00.000Z')
			};

			const [nextState, effect] = reducer(activeState, staleAction, {});
			expect(nextState).toBe(activeState);
			expect(nextState.lastSubmitted).toBe(priorDate);
			expect(effect._tag).toBe('None');
		});
	});

	describe('Real Store & Effect Execution', () => {
		it('injected time consumed once at live completion', async () => {
			const injectedDate = new Date('2025-06-15T10:30:00.000Z');
			const now = vi.fn(() => injectedDate);
			const onSubmit = vi.fn(async () => {});
			const config = createTestConfig({ now, onSubmit });

			const store = createTestStore({
				initialState: createInitialFormState(config),
				reducer: createFormReducer(config),
				dependencies: {}
			});

			stores.push(store);
			await store.send({ type: 'submitTriggered' });
			await store.receive({ type: 'formValidationStarted' });
			await store.receive({ type: 'formValidationCompleted' });
			await store.receive({ type: 'submissionStarted' });
			await store.receive({ type: 'submissionSucceeded' });

			await store.finish();
			expect(onSubmit).toHaveBeenCalledTimes(1);
			expect(now).toHaveBeenCalledTimes(1);
			expect(store.state.lastSubmitted).toBe(injectedDate);
		});

		it.each(['reset', 'destroy'] as const)('%s pending request never reads clock or dispatches success', async (retire) => {
			const now = vi.fn(() => new Date('2025-07-01T00:00:00.000Z'));
			let resolveSubmit!: () => void;
			const onSubmit = vi.fn(
				() =>
					new Promise<void>((resolve) => {
						resolveSubmit = resolve;
					})
			);

			const config = createTestConfig({ now, onSubmit });
			const store = createTestStore({
				initialState: createInitialFormState(config),
				reducer: createFormReducer(config),
				dependencies: {}
			});

			stores.push(store);
			await store.send({ type: 'submitTriggered' });
			await store.receive({ type: 'formValidationStarted' });
			await store.receive({ type: 'formValidationCompleted' });
			await store.receive({ type: 'submissionStarted' });

			if (retire === 'reset') await store.send({ type: 'formReset' });
			else store.destroy();
			const retiredState = store.state;

			resolveSubmit();
			await onSubmit.mock.results[0]!.value;
			if (retire === 'reset') await store.finish();

			expect(now).not.toHaveBeenCalled();
			expect(store.state).toBe(retiredState);
			expect(store.state.lastSubmitted).toBe(null);
		});

		it('preserves existing real submission Date behavior when now is omitted', async () => {
			const before = Date.now();
			const config = createTestConfig();
			const store = createTestStore({
				initialState: createInitialFormState(config),
				reducer: createFormReducer(config),
				dependencies: {}
			});

			stores.push(store);
			await store.send({ type: 'submitTriggered' });
			await store.receive({ type: 'formValidationStarted' });
			await store.receive({ type: 'formValidationCompleted' });
			await store.receive({ type: 'submissionStarted' });
			await store.receive({ type: 'submissionSucceeded' });

			await store.finish();
			const after = Date.now();
			expect(store.state.lastSubmitted).toBeInstanceOf(Date);
			const timestamp = store.state.lastSubmitted!.getTime();
			expect(timestamp).toBeGreaterThanOrEqual(before);
			expect(timestamp).toBeLessThanOrEqual(after);
		});
	});
});
