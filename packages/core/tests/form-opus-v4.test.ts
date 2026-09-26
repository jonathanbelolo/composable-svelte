import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createStore } from '../src/lib/store.svelte.js';
import { createTestStore } from '../src/lib/test/test-store.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';

describe('Opus v4 form findings', () => {
	it('F1 defers custom validator when intermediate is nullable null and does not call with undefined', async () => {
		const checkHandle = vi.fn(async (value: string) => {
			if (value.length < 2) throw new Error('Too short');
		});
		const config: FormConfig<{ profile: { handle: string } | null; name: string }> = {
			schema: z.object({
				profile: z.object({ handle: z.string() }).nullable(),
				name: z.string().min(1)
			}),
			initialData: { profile: null, name: '' },
			mode: 'onSubmit',
			onSubmit: vi.fn(),
			asyncValidators: {
				'profile.handle': checkHandle
			}
		};
		const store = createTestStore({
			initialState: createInitialFormState(config),
			reducer: createFormReducer(config)
		});
		try {
			await store.send({ type: 'fieldValidationStarted', field: 'profile.handle' });
			await store.receive({
				type: 'fieldValidationCompleted',
				field: 'profile.handle',
				error: null
			});
			expect(checkHandle).not.toHaveBeenCalled();
			expect(store.state.fields['profile.handle']?.error).toBeNull();
			await store.finish();
		} finally {
			store.destroy();
		}
	});

	it('F1 validates legitimate own undefined leaf when property is present', async () => {
		const checkHandle = vi.fn(async (_value: string | undefined) => {});
		const config: FormConfig<{ profile: { handle?: string | undefined }; name: string }> = {
			schema: z.object({
				profile: z.object({ handle: z.string().optional() }),
				name: z.string().min(1)
			}),
			initialData: { profile: { handle: undefined }, name: '' },
			mode: 'onSubmit',
			onSubmit: vi.fn(),
			asyncValidators: {
				'profile.handle': checkHandle
			}
		};
		const store = createTestStore({
			initialState: createInitialFormState(config),
			reducer: createFormReducer(config)
		});
		try {
			await store.send({ type: 'fieldValidationStarted', field: 'profile.handle' });
			await store.receive({
				type: 'fieldValidationCompleted',
				field: 'profile.handle',
				error: null
			});
			expect(checkHandle).toHaveBeenCalledWith(undefined, expect.any(AbortSignal));
			await store.finish();
		} finally {
			store.destroy();
		}
	});

	it('F2 authoritative full async rejection clears exonerated sibling field', async () => {
		let rejectEmail = true;
		const config: FormConfig<{ email: string; phone: string }> = {
			schema: z.object({ email: z.string(), phone: z.string() }),
			initialData: { email: 'taken@test.com', phone: 'x' },
			mode: 'onSubmit',
			onSubmit: vi.fn(),
			asyncValidators: {
				email: async () => {
					if (rejectEmail) throw new Error('Registered');
				},
				phone: async () => {
					throw new Error('Invalid phone');
				}
			}
		};
		const store = createTestStore({
			initialState: createInitialFormState(config),
			reducer: createFormReducer(config)
		});
		try {
			await store.send({ type: 'fieldValidationStarted', field: 'email' });
			await store.receive({
				type: 'fieldValidationCompleted',
				field: 'email',
				error: 'Registered'
			});
			expect(store.state.fields.email!.error).toBe('Registered');
			expect(store.state.fields.email!.asyncError).toBe('Registered');

			rejectEmail = false;
			await store.send({ type: 'formValidationStarted' });
			await store.receive({
				type: 'formValidationCompleted',
				fieldErrors: { phone: 'Invalid phone' }
			});
			expect(store.state.fields.email!.error).toBeNull();
			expect(store.state.fields.email!.asyncError).toBeNull();
			expect(store.state.fields.phone!.error).toBe('Invalid phone');
			expect(store.state.fields.phone!.asyncError).toBe('Invalid phone');
			await store.finish();
		} finally {
			store.destroy();
		}
	});

	it('F3 authoritative full async rejection retires pending field attempt and aborts its signal', async () => {
		let releaseEmail!: () => void;
		let emailSignal: AbortSignal | undefined;
		let emailCalls = 0;
		const config: FormConfig<{ email: string; phone: string }> = {
			schema: z.object({ email: z.string(), phone: z.string() }),
			initialData: { email: 'taken@test.com', phone: 'x' },
			mode: 'onSubmit',
			onSubmit: vi.fn(),
			asyncValidators: {
				email: async (_value, signal) => {
					emailCalls++;
					if (emailCalls === 1) {
						emailSignal = signal;
						await new Promise<void>(done => { releaseEmail = done; });
						throw new Error('Registered');
					}
				},
				phone: async () => {
					throw new Error('Invalid phone');
				}
			}
		};
		const store = createTestStore({
			initialState: createInitialFormState(config),
			reducer: createFormReducer(config)
		});
		try {
			await store.send({ type: 'fieldValidationStarted', field: 'email' });
			await store.send({ type: 'formValidationStarted' });
			await store.receive({
				type: 'formValidationCompleted',
				fieldErrors: { phone: 'Invalid phone' }
			});
			expect(emailSignal?.aborted).toBe(true);
			releaseEmail();
			expect(store.state.fields.email!.error).toBeNull();
			expect(store.state.fields.email!.isValidating).toBe(false);
			expect(store.state.fields.phone!.error).toBe('Invalid phone');
			await store.finish();
		} finally {
			store.destroy();
		}
	});

	it('F3 production store aborts in-flight field validation on authoritative form rejection', async () => {
		let releaseEmail!: () => void;
		let emailSignal: AbortSignal | undefined;
		let emailCalls = 0;
		const config: FormConfig<{ email: string; phone: string }> = {
			schema: z.object({ email: z.string(), phone: z.string() }),
			initialData: { email: 'taken@test.com', phone: 'x' },
			mode: 'onSubmit',
			onSubmit: vi.fn(),
			asyncValidators: {
				email: async (_value, signal) => {
					emailCalls++;
					if (emailCalls === 1) {
						emailSignal = signal;
						await new Promise<void>(done => { releaseEmail = done; });
						throw new Error('Registered');
					}
				},
				phone: async () => {
					throw new Error('Invalid phone');
				}
			}
		};
		const store = createStore({
			initialState: createInitialFormState(config),
			reducer: createFormReducer(config),
			ssr: { deferEffects: false }
		});
		try {
			store.dispatch({ type: 'fieldValidationStarted', field: 'email' });
			await expect.poll(() => emailCalls).toBe(1);
			store.dispatch({ type: 'submitTriggered' });
			await expect.poll(() => store.state.fields.phone!.error).toBe('Invalid phone');
			expect(emailSignal?.aborted).toBe(true);
			releaseEmail();
			await new Promise(resolve => setTimeout(resolve, 0));
			expect(store.state.fields.email!.error).toBeNull();
			expect(store.state.fields.email!.isValidating).toBe(false);
		} finally {
			store.destroy();
			releaseEmail?.();
		}
	});

	it('F4 preserves opaque-parent async rejection when unrelated field becomes invalid', async () => {
		let release!: () => void;
		const config: FormConfig<{ handle: string; name: string }> = {
			schema: z.object({ handle: z.string(), name: z.string().min(1) }).transform(d => ({ ...d, handle: d.handle.toLowerCase() })),
			initialData: { handle: 'ADA', name: 'A' },
			mode: 'onSubmit',
			onSubmit: vi.fn(),
			asyncValidators: {
				handle: async (value: string) => {
					await new Promise<void>(done => { release = done; });
					if (value === 'ada') throw new Error('Taken');
				}
			}
		};
		const store = createTestStore({
			initialState: createInitialFormState(config),
			reducer: createFormReducer(config)
		});
		try {
			await store.send({ type: 'fieldValidationStarted', field: 'handle' });
			await store.send({ type: 'fieldChanged', field: 'name', value: '' });
			release();
			await store.receive({
				type: 'fieldValidationCompleted',
				field: 'handle',
				error: 'Taken'
			});
			expect(store.state.fields.handle!.error).toBe('Taken');
			expect(store.state.fields.handle!.asyncError).toBe('Taken');
			expect(store.state.fields.handle!.isValidating).toBe(false);
			await store.finish();
		} finally {
			store.destroy();
		}
	});
});

it('authoritative rejection checks own error keys for prototype-named fields', async () => {
  const config: FormConfig<{ toString: string; phone: string }> = {
    schema: z.object({ toString: z.string(), phone: z.string() }),
    initialData: { toString: 'name', phone: 'x' },
    onSubmit: vi.fn(),
    asyncValidators: { toString: async () => {}, phone: async () => { throw new Error('Invalid'); } }
  };
  const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
  try {
    store.dispatch({ type: 'formValidationStarted' });
    await vi.waitFor(() => expect(store.state.submitOutcome).toBe('failed'));
    expect(store.state.fields.toString?.error).toBeNull();
  } finally { store.destroy(); }
});
