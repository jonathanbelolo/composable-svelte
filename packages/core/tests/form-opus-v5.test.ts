import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createStore } from '../src/lib/store.svelte.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';

it.each(['valid', ''])('does not validate an absent normalized child with sibling %s', async name => {
  const validator = vi.fn(async (_value: string) => {});
  const config: FormConfig<{ profile: { handle: string } | null; name: string }> = {
    schema: z.object({ profile: z.object({ handle: z.string() }).nullable(), name: z.string().min(1) }),
    initialData: { profile: null, name }, mode: 'onSubmit',
    asyncValidators: { 'profile.handle': validator }, onSubmit: vi.fn()
  };
  const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
  try {
    store.dispatch({ type: 'fieldValidationStarted', field: 'profile.handle' });
    await vi.waitFor(() => expect(store.state.fields['profile.handle']?.isValidating).toBe(false));
    expect(validator).not.toHaveBeenCalled();
    store.dispatch({ type: 'formValidationStarted' });
    await vi.waitFor(() => expect(store.state.isValidating).toBe(false));
    expect(validator).not.toHaveBeenCalled();
  } finally { store.destroy(); }
});

it.each(['valid', ''])('distinguishes absent optional from own undefined with sibling %s', async name => {
  for (const present of [false, true]) {
    const validator = vi.fn(async (_value: string | undefined) => {});
    const config: FormConfig<{ profile: { handle?: string | undefined }; name: string }> = {
      schema: z.object({ profile: z.object({ handle: z.string().optional() }), name: z.string().min(1) }),
      initialData: { profile: present ? { handle: undefined } : {}, name }, mode: 'onSubmit',
      asyncValidators: { 'profile.handle': validator }, onSubmit: vi.fn()
    };
    const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
    try {
      store.dispatch({ type: 'fieldValidationStarted', field: 'profile.handle' });
      await vi.waitFor(() => expect(store.state.fields['profile.handle']?.isValidating).toBe(false));
      expect(validator).toHaveBeenCalledTimes(present ? 1 : 0);
    } finally { store.destroy(); }
  }
});

it('clears disproved schema error on a later schema-invalid form pass', async () => {
  const config: FormConfig<{ password: string; confirm: string; name: string }> = {
    schema: z.object({ password: z.string(), confirm: z.string(), name: z.string().min(1) })
      .refine(data => data.password === data.confirm, { path: ['confirm'], message: 'Mismatch' }),
    initialData: { password: 'a', confirm: 'b', name: 'A' }, mode: 'onSubmit', onSubmit: vi.fn()
  };
  const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
  try {
    store.dispatch({ type: 'formValidationStarted' });
    await vi.waitFor(() => expect(store.state.submitCount).toBe(1));
    expect(store.state.fields.confirm?.error).toBe('Mismatch');
    store.dispatch({ type: 'fieldChanged', field: 'password', value: 'b' });
    store.dispatch({ type: 'fieldChanged', field: 'name', value: '' });
    store.dispatch({ type: 'formValidationStarted' });
    await vi.waitFor(() => expect(store.state.submitCount).toBe(2));
    expect(store.state.fields.confirm?.error).toBeNull();
    expect(store.state.fields.name?.error).toBeTruthy();
  } finally { store.destroy(); }
});

it.each(['valid', ''])('does not manufacture a top-level optional value with sibling %s', async name => {
  const validator = vi.fn(async (_value: string | undefined) => {});
  const config: FormConfig<{ handle?: string | undefined; name: string }> = {
    schema: z.object({ handle: z.string().optional(), name: z.string().min(1) }),
    initialData: { name }, mode: 'onSubmit', asyncValidators: { handle: validator }, onSubmit: vi.fn()
  };
  const store = createStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config), ssr: { deferEffects: false } });
  try {
    store.dispatch({ type: 'fieldValidationStarted', field: 'handle' });
    await vi.waitFor(() => expect(store.state.fields.handle?.isValidating).toBe(false));
    expect(validator).not.toHaveBeenCalled();
  } finally { store.destroy(); }
});

it('pins the schema boundary between absent and explicitly undefined keys', () => {
  const schema = z.object({ handle: z.string().optional() });
  expect(Object.hasOwn(schema.parse({ handle: undefined }), 'handle')).toBe(true);
  expect(Object.hasOwn(schema.parse({}), 'handle')).toBe(false);
});
