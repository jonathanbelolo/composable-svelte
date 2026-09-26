import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createTestStore } from '../src/lib/test/test-store.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';

describe('Opus v3 form findings', () => {
  for (const firstTaken of [false, true]) {
    it(`R3-1 rechecks changed normalized output while raw field is unchanged (${firstTaken})`, async () => {
      let release!: () => void;
      const values: string[] = [];
      const config: FormConfig<{ handle: string; tenant: string }> = {
        schema: z.object({ handle: z.string(), tenant: z.string() }).transform(data => ({ ...data, handle: `${data.tenant}:${data.handle}` })),
        initialData: { handle: 'ada', tenant: 'acme' }, mode: 'onSubmit', onSubmit: vi.fn(),
        asyncValidators: { handle: async (value: string) => {
          values.push(value);
          if (values.length === 1) await new Promise<void>(done => { release = done; });
          if (value === (firstTaken ? 'acme:ada' : 'globex:ada')) throw new Error('Taken');
        } }
      };
      const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
      try {
        await store.send({ type: 'fieldValidationStarted', field: 'handle' });
        await store.send({ type: 'fieldChanged', field: 'tenant', value: 'globex' });
        release();
        await store.receive({ type: 'fieldValidationCompleted', field: 'handle', error: firstTaken ? 'Taken' : null });
        await store.receive({ type: 'fieldValidationStarted', field: 'handle' });
        await store.receive({ type: 'fieldValidationCompleted', field: 'handle', error: firstTaken ? null : 'Taken' });
        expect(values).toEqual(['acme:ada', 'globex:ada']);
        expect(store.state.fields.handle!.error).toBe(firstTaken ? null : 'Taken');
        expect(store.state.data.handle).toBe('ada');
        await store.finish();
      } finally { store.destroy(); }
    });
  }

  it('R3-2 sibling schema clearing preserves a completed async rejection', async () => {
    const config: FormConfig<{ email: string; name: string }> = {
      schema: z.object({ email: z.string().email(), name: z.string().min(1) }),
      initialData: { email: 'taken@test.com', name: 'A' }, mode: 'onSubmit', onSubmit: vi.fn(),
      asyncValidators: { email: async () => { throw new Error('Registered'); } }
    };
    const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
    try {
      await store.send({ type: 'fieldValidationStarted', field: 'email' });
      await store.receive({ type: 'fieldValidationCompleted', field: 'email', error: 'Registered' });
      await store.send({ type: 'fieldValidationStarted', field: 'name' });
      await store.receive({ type: 'fieldValidationCompleted', field: 'name', error: null });
      await store.receive({ type: 'fieldValidationCompleted', field: 'email', schemaOnly: true });
      expect(store.state.fields.email!.error).toBe('Registered');
      await store.finish();
    } finally { store.destroy(); }
  });

  for (const wrapper of ['default', 'catch', 'readonly', 'transform'] as const) {
    it(`R3-3 parses intermediate ${wrapper} semantics with an invalid unrelated field`, async () => {
      const base = z.object({ handle: z.string().trim() });
      const profile = wrapper === 'default' ? base.default({ handle: 'default' })
        : wrapper === 'catch' ? base.catch({ handle: 'fallback' })
        : wrapper === 'readonly' ? base.readonly()
        : base.transform(value => ({ handle: `normalized:${value.handle}` }));
      const validator = vi.fn(async (_value: string) => {});
      const config: FormConfig<{ profile: { handle: string }; name: string }> = {
        schema: z.object({ profile, name: z.string().min(1) }), initialData: { profile: { handle: ' ada ' }, name: '' },
        mode: 'onSubmit', onSubmit: vi.fn(), asyncValidators: { 'profile.handle': validator }
      };
      const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
      try {
        await store.send({ type: 'fieldValidationStarted', field: 'profile.handle' });
        await store.receive({ type: 'fieldValidationCompleted', field: 'profile.handle', error: null });
        expect(validator).toHaveBeenCalledWith(wrapper === 'transform' ? 'normalized:ada' : 'ada', expect.any(AbortSignal));
        expect(store.state.data.profile.handle).toBe(' ada ');
        await store.finish();
      } finally { store.destroy(); }
    });
  }

  it('NEW-FORM-ASYNC-VERDICT successful full validation clears previous field rejection', async () => {
    let reject = true;
    const config: FormConfig<{ email: string }> = {
      schema: z.object({ email: z.string().email() }), initialData: { email: 'taken@test.com' }, mode: 'onSubmit', onSubmit: vi.fn(),
      asyncValidators: { email: async () => { if (reject) throw new Error('Registered'); } }
    };
    const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
    try {
      await store.send({ type: 'fieldValidationStarted', field: 'email' });
      await store.receive({ type: 'fieldValidationCompleted', field: 'email', error: 'Registered' });
      reject = false;
      await store.send({ type: 'formValidationStarted' });
      await store.receive({ type: 'formValidationCompleted', fieldErrors: {} });
      expect(store.state.fields.email!.error).toBeNull();
      await store.receive({ type: 'submissionStarted' });
      await store.receive({ type: 'submissionSucceeded' });
      await store.finish();
    } finally { store.destroy(); }
  });
});

it('R3-3 uses intermediate catch output and never bypasses transforming wrappers', async () => {
  const validator = vi.fn(async (_value: string) => {});
  const config: FormConfig<{ profile: { handle: string }; name: string }> = {
    schema: z.object({ profile: z.object({ handle: z.string().min(3) }).catch({ handle: 'fallback' }).transform(profile => ({ handle: `wrapped:${profile.handle}` })), name: z.string().min(1) }),
    initialData: { profile: { handle: '' }, name: '' }, mode: 'onSubmit', onSubmit: vi.fn(), asyncValidators: { 'profile.handle': validator }
  };
  const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
  try {
    await store.send({ type: 'fieldValidationStarted', field: 'profile.handle' });
    await store.receive({ type: 'fieldValidationCompleted', field: 'profile.handle', error: null });
    expect(validator).toHaveBeenCalledWith('wrapped:fallback', expect.any(AbortSignal));
    await store.finish();
  } finally { store.destroy(); }
});

it('R3-3 retains deferral for an unparseable root transform instead of supplying raw input', async () => {
  const validator = vi.fn(async (_value: string) => {});
  const config: FormConfig<{ handle: string; name: string }> = {
    schema: z.object({ handle: z.string(), name: z.string().min(1) }).transform(data => ({ ...data, handle: `${data.name}:${data.handle}` })),
    initialData: { handle: 'ada', name: '' }, mode: 'onSubmit', onSubmit: vi.fn(), asyncValidators: { handle: validator }
  };
  const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
  try {
    await store.send({ type: 'fieldValidationStarted', field: 'handle' });
    await store.receive({ type: 'fieldValidationCompleted', field: 'handle', error: null });
    expect(validator).not.toHaveBeenCalled();
    await store.finish();
  } finally { store.destroy(); }
});

it('R3-2 preserves a full-form custom rejection across a later sibling schema pass', async () => {
  const config: FormConfig<{ email: string; name: string }> = {
    schema: z.object({ email: z.string(), name: z.string() }), initialData: { email: 'taken', name: 'A' }, mode: 'onSubmit', onSubmit: vi.fn(),
    asyncValidators: { email: async () => { throw new Error('Registered'); } }
  };
  const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
  try {
    await store.send({ type: 'formValidationStarted' });
    await store.receive({ type: 'formValidationCompleted', fieldErrors: { email: 'Registered' } });
    await store.send({ type: 'fieldValidationStarted', field: 'name' });
    await store.receive({ type: 'fieldValidationCompleted', field: 'name', error: null });
    await store.receive({ type: 'fieldValidationCompleted', field: 'email', schemaOnly: true });
    expect(store.state.fields.email!.error).toBe('Registered');
    await store.send({ type: 'clearFieldError', field: 'email' });
    expect(store.state.fields.email!.error).toBeNull();
    expect(store.state.fields.email!.asyncError).toBeNull();
    await store.finish();
  } finally { store.destroy(); }
});

it('successful full validation retires a pending field verdict before submission', async () => {
  let release!: () => void; let firstSignal: AbortSignal | undefined; let calls = 0;
  const config: FormConfig<{ email: string }> = {
    schema: z.object({ email: z.string() }), initialData: { email: 'ada' }, mode: 'onSubmit', onSubmit: vi.fn(),
    asyncValidators: { email: async (_value, signal) => {
      if (++calls === 1) { firstSignal = signal; await new Promise<void>(done => { release = done; }); throw new Error('obsolete'); }
    } }
  };
  const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
  try {
    await store.send({ type: 'fieldValidationStarted', field: 'email' });
    await store.send({ type: 'formValidationStarted' });
    await store.receive({ type: 'formValidationCompleted', fieldErrors: {} });
    expect(firstSignal?.aborted).toBe(true);
    release();
    await store.receive({ type: 'submissionStarted' });
    await store.receive({ type: 'submissionSucceeded' });
    expect(store.state.fields.email!.error).toBeNull();
    expect(store.state.fields.email!.isValidating).toBe(false);
    await store.finish();
  } finally { store.destroy(); }
});

it('R3-1 object-valued normalized output rechecks once after sibling changes', async () => {
  let release!: () => void;
  const seen: string[] = [];
  const config: FormConfig<{ profile: { handle: string }; tenant: string }> = {
    schema: z.object({ profile: z.object({ handle: z.string() }), tenant: z.string() }).transform(data => ({ ...data, profile: { handle: `${data.tenant}:${data.profile.handle}` } })),
    initialData: { profile: { handle: 'ada' }, tenant: 'acme' }, mode: 'onSubmit', onSubmit: vi.fn(),
    asyncValidators: { profile: async (value: { handle: string }) => {
      seen.push(value.handle);
      if (seen.length === 1) await new Promise<void>(done => { release = done; });
      if (value.handle === 'globex:ada') throw new Error('Taken');
    } }
  };
  const store = createTestStore({ initialState: createInitialFormState(config), reducer: createFormReducer(config) });
  try {
    await store.send({ type: 'fieldValidationStarted', field: 'profile' });
    await store.send({ type: 'fieldChanged', field: 'tenant', value: 'globex' });
    release();
    await store.receive({ type: 'fieldValidationCompleted', field: 'profile', error: null });
    await store.receive({ type: 'fieldValidationStarted', field: 'profile' });
    await store.receive({ type: 'fieldValidationCompleted', field: 'profile', error: 'Taken' });
    expect(seen).toEqual(['acme:ada', 'globex:ada']);
    await store.finish();
  } finally { store.destroy(); }
});
