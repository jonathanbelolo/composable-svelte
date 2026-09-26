import { expect, it, vi } from 'vitest';
import { createStore, Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, nestedSlot, optionalSlot } from '@composable-svelte/core/application';
import { createInitialLoginState } from '../src/lib/flows/index.js';
import { createAuthFeature, type AuthFeatureAction, type AuthFeatureDependencies, type AuthFeatureState } from '../src/lib/application/index.js';
import { authShell, createInitialAuthShellState, loginSlot, type AuthShellAction, type AuthShellDependencies, type AuthShellState } from './fixtures/managed-auth-shell.js';
import { controlledAuthDeps, settle, snapshot } from './fixtures/managed-auth-drivers.js';
import type { PresentationAction } from '@composable-svelte/core';

type RootState = { a: AuthShellState | null; b: AuthShellState | null };
type RootAction =
  | { type: 'a'; action: PresentationAction<AuthShellAction> }
  | { type: 'b'; action: PresentationAction<AuthShellAction> }
  | { type: 'removeA' };
const aSlot = optionalSlot<RootState, RootAction>()('a');
const bSlot = optionalSlot<RootState, RootAction>()('b');
const root: Reducer<RootState, RootAction, AuthShellDependencies> = (state, action) =>
  [action.type === 'removeA' ? { ...state, a: null } : state, Effect.none()];
const composition = new ManagedIntegrationBuilder(root).with(aSlot, authShell).with(bSlot, authShell).build();

it('keeps two managed auth siblings independent across concurrent login and one retirement', async () => {
  const { deps, logins } = controlledAuthDeps();
  const store = createStore({
    initialState: {
      a: createInitialAuthShellState({ login: createInitialLoginState() }),
      b: createInitialAuthShellState({ login: createInitialLoginState() })
    } satisfies RootState,
    reducer: composition.reducer,
    execution: composition.execution,
    dependencies: deps
  });
  try {
    async function submit(slot: typeof aSlot | typeof bSlot, email: string, expected: number) {
      const inner = nestedSlot(slot, loginSlot);
      const view = composition.bind(store, inner)!;
      view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: email } });
      view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'correct-horse' } });
      view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
      await vi.waitFor(() => expect(logins).toHaveLength(expected));
    }
    for (const [slot, email, expected] of [[aSlot, 'a@example.com', 1], [bSlot, 'b@example.com', 2]] as const) {
      await submit(slot, email, expected);
    }
    expect(logins[0]!.signal?.aborted).toBe(false);
    expect(logins[1]!.signal?.aborted).toBe(false);
    const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
    const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
    logins[0]!.resolve(ada);
    logins[1]!.resolve(bob);
    await settle();
    expect(store.state.a?.session.subject.kind).toBe('authenticated');
    expect(store.state.b?.session.subject.kind).toBe('authenticated');
    expect(store.state.a?.session.subject.kind === 'authenticated' && store.state.a.session.subject.id).toBe(ada.subject_id);
    expect(store.state.b?.session.subject.kind === 'authenticated' && store.state.b.session.subject.id).toBe(bob.subject_id);

    composition.bind(store, aSlot)!.dispatch({ type: 'signInOpened' });
    composition.bind(store, bSlot)!.dispatch({ type: 'signInOpened' });
    await submit(aSlot, 'old-a@example.com', 3);
    await submit(bSlot, 'new-b@example.com', 4);
    expect(logins[2]!.signal?.aborted).toBe(false);
    expect(logins[3]!.signal?.aborted).toBe(false);
    store.dispatch({ type: 'removeA' });
    expect(logins[2]!.signal?.aborted).toBe(true);
    expect(logins[3]!.signal?.aborted).toBe(false);
    logins[2]!.resolve(ada);
    logins[3]!.resolve(bob);
    await settle();
    expect(store.state.a).toBeNull();
    expect(store.state.b?.session.subject.kind === 'authenticated' && store.state.b.session.subject.id).toBe(bob.subject_id);
  } finally {
    store.destroy();
  }
});

it('isolates two package-owned signup siblings through concurrent requests and retirement', async () => {
  type State = { a: AuthFeatureState | null; b: AuthFeatureState | null };
  type Action =
    | { type: 'a'; action: PresentationAction<AuthFeatureAction> }
    | { type: 'b'; action: PresentationAction<AuthFeatureAction> }
    | { type: 'removeA' };
  const auth = createAuthFeature();
  const a = optionalSlot<State, Action>()('a');
  const b = optionalSlot<State, Action>()('b');
  const reducer: Reducer<State, Action, AuthFeatureDependencies> = (state, action) =>
    [action.type === 'removeA' ? { ...state, a: null } : state, Effect.none()];
  const app = new ManagedIntegrationBuilder(reducer)
    .with(a, auth.composition)
    .with(b, auth.composition)
    .build();
  const { deps, signups } = controlledAuthDeps();
  const store = createStore({
    initialState: { a: auth.initialState(), b: auth.initialState() } satisfies State,
    reducer: app.reducer,
    execution: app.execution,
    dependencies: deps
  });
  try {
    async function submit(slot: typeof a | typeof b, email: string, expected: number) {
      const view = app.bind(store, nestedSlot(slot, auth.signupSlot));
      if (view === undefined) throw new Error('no live signup flow');
      const password = 'correct-horse-battery-staple';
      for (const [field, value] of [['email', email], ['password', password], ['confirmPassword', password]] as const) {
        view.dispatch({ type: 'form', action: { type: 'fieldChanged', field, value } });
      }
      view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
      await vi.waitFor(() => expect(signups).toHaveLength(expected));
    }
    app.bind(store, a)!.dispatch({ type: 'openSignup' });
    app.bind(store, b)!.dispatch({ type: 'openSignup' });
    await submit(a, 'a@example.com', 1);
    await submit(b, 'b@example.com', 2);
    expect(signups[0]!.signal?.aborted).toBe(false);
    expect(signups[1]!.signal?.aborted).toBe(false);
    const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
    const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
    signups[0]!.resolve({ kind: 'session', session: ada });
    signups[1]!.resolve({ kind: 'session', session: bob });
    await settle();
    expect(store.state.a?.session.subject.kind === 'authenticated' && store.state.a.session.subject.id).toBe(ada.subject_id);
    expect(store.state.b?.session.subject.kind === 'authenticated' && store.state.b.session.subject.id).toBe(bob.subject_id);
    expect(store.state.a?.handoff?.source).toBe('signup');
    expect(store.state.b?.handoff?.source).toBe('signup');

    app.bind(store, a)!.dispatch({ type: 'restartSignup' });
    app.bind(store, b)!.dispatch({ type: 'restartSignup' });
    await submit(a, 'old-a@example.com', 3);
    await submit(b, 'new-b@example.com', 4);
    store.dispatch({ type: 'removeA' });
    expect(signups[2]!.signal?.aborted).toBe(true);
    expect(signups[3]!.signal?.aborted).toBe(false);
    signups[2]!.resolve({ kind: 'session', session: bob });
    signups[3]!.resolve({ kind: 'verificationRequired', email: 'new-b@example.com' });
    await settle();
    expect(store.state.a).toBeNull();
    expect(store.state.b?.signup?.status).toBe('awaitingVerification');
    expect(store.state.b?.signup?.pendingEmail).toBe('new-b@example.com');
    expect(store.state.b?.handoff).toBeNull();
  } finally {
    store.destroy();
  }
});

it('keeps reset requests with the same cancellation ID isolated across siblings', async () => {
  type State = { a: AuthFeatureState | null; b: AuthFeatureState | null };
  type Action =
    | { type: 'a'; action: PresentationAction<AuthFeatureAction> }
    | { type: 'b'; action: PresentationAction<AuthFeatureAction> }
    | { type: 'removeA' };
  const auth = createAuthFeature();
  const a = optionalSlot<State, Action>()('a');
  const b = optionalSlot<State, Action>()('b');
  const reducer: Reducer<State, Action, AuthFeatureDependencies> = (state, action) =>
    [action.type === 'removeA' ? { ...state, a: null } : state, Effect.none()];
  const app = new ManagedIntegrationBuilder(reducer).with(a, auth.composition).with(b, auth.composition).build();
  const { deps, resetPasswords } = controlledAuthDeps();
  const store = createStore({
    initialState: { a: auth.initialState(), b: auth.initialState() } satisfies State,
    reducer: app.reducer,
    execution: app.execution,
    dependencies: deps
  });
  try {
    async function submit(slot: typeof a | typeof b, expected: number) {
      const view = app.bind(store, nestedSlot(slot, auth.resetPasswordSlot));
      if (view === undefined) throw new Error('no live reset flow');
      for (const field of ['password', 'confirmPassword'] as const) {
        view.dispatch({ type: 'form', action: { type: 'fieldChanged', field, value: 'correct-horse-battery-staple' } });
      }
      view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
      await vi.waitFor(() => expect(resetPasswords).toHaveLength(expected));
    }
    app.bind(store, a)!.dispatch({ type: 'openResetPassword', token: 'token-a' });
    app.bind(store, b)!.dispatch({ type: 'openResetPassword', token: 'token-b' });
    await submit(a, 1);
    await submit(b, 2);
    expect(resetPasswords[0]!.signal?.aborted).toBe(false);
    expect(resetPasswords[1]!.signal?.aborted).toBe(false);
    store.dispatch({ type: 'removeA' });
    expect(resetPasswords[0]!.signal?.aborted).toBe(true);
    expect(resetPasswords[1]!.signal?.aborted).toBe(false);
    const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
    const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
    resetPasswords[0]!.resolve(ada);
    resetPasswords[1]!.resolve(bob);
    await settle();
    expect(store.state.a).toBeNull();
    expect(store.state.b?.session.subject.kind === 'authenticated' && store.state.b.session.subject.id).toBe(bob.subject_id);
    expect(store.state.b?.handoff).toEqual({ kind: 'accepted', source: 'resetPassword', session: bob });
  } finally {
    store.destroy();
  }
});

it('keeps concurrent verification and resend IDs isolated across siblings', async () => {
  type State = { a: AuthFeatureState | null; b: AuthFeatureState | null };
  type Action =
    | { type: 'a'; action: PresentationAction<AuthFeatureAction> }
    | { type: 'b'; action: PresentationAction<AuthFeatureAction> }
    | { type: 'removeA' };
  const auth = createAuthFeature();
  const a = optionalSlot<State, Action>()('a');
  const b = optionalSlot<State, Action>()('b');
  const reducer: Reducer<State, Action, AuthFeatureDependencies> = (state, action) =>
    [action.type === 'removeA' ? { ...state, a: null } : state, Effect.none()];
  const app = new ManagedIntegrationBuilder(reducer).with(a, auth.composition).with(b, auth.composition).build();
  const { deps, verifications, resends } = controlledAuthDeps();
  const store = createStore({
    initialState: { a: auth.initialState(), b: auth.initialState() } satisfies State,
    reducer: app.reducer,
    execution: app.execution,
    dependencies: deps
  });
  try {
    app.bind(store, a)!.dispatch({ type: 'openEmailVerification', email: 'a@example.com' });
    app.bind(store, b)!.dispatch({ type: 'openEmailVerification', email: 'b@example.com' });
    const av = app.bind(store, nestedSlot(a, auth.emailVerificationSlot))!;
    const bv = app.bind(store, nestedSlot(b, auth.emailVerificationSlot))!;
    av.dispatch({ type: 'verificationRequested', token: 'a-token' });
    av.dispatch({ type: 'resendRequested' });
    bv.dispatch({ type: 'verificationRequested', token: 'b-token' });
    bv.dispatch({ type: 'resendRequested' });
    await vi.waitFor(() => { expect(verifications).toHaveLength(2); expect(resends).toHaveLength(2); });
    expect(verifications[0]!.signal?.aborted).toBe(false);
    expect(resends[0]!.signal?.aborted).toBe(false);
    expect(verifications[1]!.signal?.aborted).toBe(false);
    expect(resends[1]!.signal?.aborted).toBe(false);
    store.dispatch({ type: 'removeA' });
    expect(verifications[0]!.signal?.aborted).toBe(true);
    expect(resends[0]!.signal?.aborted).toBe(true);
    expect(verifications[1]!.signal?.aborted).toBe(false);
    expect(resends[1]!.signal?.aborted).toBe(false);
    const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
    const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');
    verifications[0]!.resolve(ada);
    resends[0]!.resolve();
    verifications[1]!.reject({ code: 'token_expired', message: 'Expired.' });
    resends[1]!.resolve();
    await settle();
    expect(store.state.a).toBeNull();
    expect(store.state.b?.emailVerification?.error?.code).toBe('token_expired');
    expect(store.state.b?.emailVerification?.resendStatus).toBe('sent');
    expect(store.state.b?.session.subject.kind).toBe('anonymous');
  } finally {
    store.destroy();
  }
});
