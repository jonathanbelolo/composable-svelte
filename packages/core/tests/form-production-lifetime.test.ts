import { it, expect, vi } from 'vitest';
import { z } from 'zod';
import { createStore } from '../src/lib/store.svelte.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';
it('production store replaces debounced field work and aborts its actual validator signal', async () => {
	const signals: AbortSignal[] = [];
	const releases: Array<() => void> = [];
	const config: FormConfig<{
		email: string;
	}> = { schema: z.object({ email: z.string() }), initialData: { email: '' }, mode: 'onChange', debounceMs: 5, onSubmit: vi.fn(), asyncValidators: { email: async (_v, signal) => { signals.push(signal!); await new Promise<void>(r => releases.push(r)); } } };
	const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
	try {
		store.dispatch({ type: 'fieldChanged', field: 'email', value: 'first' });
		await expect.poll(() => signals.length).toBe(1);
		store.dispatch({ type: 'fieldChanged', field: 'email', value: 'second' });
		expect(signals[0]!.aborted).toBe(true);
		await expect.poll(() => signals.length).toBe(2);
		releases[0]!();
		releases[1]!();
		await expect.poll(() => store.state.fields.email!.isValidating).toBe(false);
		expect(store.state.data.email).toBe('second');
		expect(store.state.fields.email!.error).toBeNull();
	}
	finally {
		store.destroy();
		for (const release of releases)
			release();
	}
});

it('production rejects stale normalized verdict and preserves its replacement across sibling validation', async () => {
  let release!: () => void;
  const values: string[] = [];
  const config: FormConfig<{ handle: string; tenant: string; name: string }> = {
    schema: z.object({ handle: z.string(), tenant: z.string(), name: z.string() }).transform(data => ({ ...data, handle: `${data.tenant}:${data.handle}` })),
    initialData: { handle: 'ada', tenant: 'acme', name: 'A' }, mode: 'onSubmit', onSubmit: vi.fn(),
    asyncValidators: { handle: async (value: string) => {
      values.push(value);
      if (values.length === 1) await new Promise<void>(done => { release = done; });
      if (value === 'globex:ada') throw new Error('Taken');
    } }
  };
  const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
  try {
    store.dispatch({ type: 'fieldValidationStarted', field: 'handle' });
    store.dispatch({ type: 'fieldChanged', field: 'tenant', value: 'globex' });
    release();
    await expect.poll(() => store.state.fields.handle!.error).toBe('Taken');
    expect(values).toEqual(['acme:ada', 'globex:ada']);
    store.dispatch({ type: 'fieldValidationStarted', field: 'name' });
    await expect.poll(() => store.state.fields.name!.isValidating).toBe(false);
    expect(store.state.fields.handle!.error).toBe('Taken');
    expect(store.state.data.handle).toBe('ada');
  } finally { store.destroy(); }
});
