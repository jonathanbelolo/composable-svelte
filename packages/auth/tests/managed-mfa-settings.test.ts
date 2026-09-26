/**
 * Managed MFA enrolment and management through `createAuthFeature`: owned
 * operations, the `mfaOutcome` pulse, settings lifetime beside temporary flows,
 * retirement and sibling isolation. Headless — the views are core's genuine
 * `PresentationView`s, with requests held open by `controlledAuthDeps`.
 */
import { afterEach, expect, it, vi } from 'vitest';
import { createStore, Effect, type PresentationAction, type Reducer, type Store } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, nestedSlot, optionalSlot, type PresentationView } from '@composable-svelte/core/application';

import {
	createAuthFeature,
	type AuthFeature,
	type AuthFeatureAction,
	type AuthFeatureDependencies,
	type AuthFeatureState
} from '../src/lib/application/index.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type {
	MfaEnrolmentAction,
	MfaEnrolmentState,
	MfaManagementAction,
	MfaManagementState
} from '../src/lib/flows/index.js';
import { createInitialMfaEnrolmentState, createInitialMfaManagementState } from '../src/lib/flows/index.js';
import { createInitialSessionState, type SessionState } from '../src/lib/session/index.js';
import { subjectFromSession } from '../src/lib/subject/index.js';
import { controlledAuthDeps, settle, snapshot, type BeginEnrolmentRequest, type ConfirmEnrolmentRequest } from './fixtures/managed-auth-drivers.js';

type AuthStore = Store<AuthFeatureState, AuthFeatureAction>;

const NEEDS_PROOF: AuthError = {
	code: 'reauthentication_required',
	message: 'Confirm it is still you.',
	methods: ['password', 'totp']
};
const START = { enrolmentId: 'enr-1', secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/Acme:ada?secret=JBSWY3DPEHPK3PXP' };
const CODES = ['aaa-111', 'bbb-222'];

const stores: Array<{ destroy(): void }> = [];
afterEach(() => {
	for (const store of stores.splice(0)) store.destroy();
});

const ada = snapshot('aaaaaaaa-0000-0000-0000-000000000001', 'Ada');
const bob = snapshot('bbbbbbbb-0000-0000-0000-000000000002', 'Bob');

/** A session signed in as `who`: settings open only for an authenticated subject. */
function signedIn(who: typeof ada): SessionState {
	return { ...createInitialSessionState(), status: 'authenticated', subject: subjectFromSession(who) };
}

function createAuthStore(
	auth: AuthFeature,
	deps: AuthFeatureDependencies,
	initial: Partial<AuthFeatureState> = { session: signedIn(ada) }
): AuthStore {
	const initialState: AuthFeatureState = { ...auth.initialState(), ...initial };
	const store = createStore({
		initialState,
		reducer: auth.composition.reducer,
		execution: auth.composition.execution,
		dependencies: deps
	});
	stores.push(store);
	return store;
}

function enrolmentView(auth: AuthFeature, store: AuthStore): PresentationView<MfaEnrolmentState, MfaEnrolmentAction> {
	const view = auth.composition.bind(store, auth.mfaEnrolmentSlot);
	if (view === undefined) throw new Error('no live enrolment');
	return view;
}

function managementView(auth: AuthFeature, store: AuthStore): PresentationView<MfaManagementState, MfaManagementAction> {
	const view = auth.composition.bind(store, auth.mfaManagementSlot);
	if (view === undefined) throw new Error('no live management panel');
	return view;
}

/** Every reduced action with the `mfaOutcome` its reduction left behind. */
function observeOutcomes(store: AuthStore) {
	const seen: Array<{ action: AuthFeatureAction; outcome: AuthFeatureState['mfaOutcome'] }> = [];
	store.subscribeToActions?.((action) => seen.push({ action, outcome: store.state.mfaOutcome }));
	return seen;
}

async function startEnrolment(view: PresentationView<MfaEnrolmentState, MfaEnrolmentAction>, begins: readonly BeginEnrolmentRequest[]) {
	const before = begins.length;
	view.dispatch({ type: 'enrolmentRequested' });
	await vi.waitFor(() => expect(begins).toHaveLength(before + 1));
	return begins[before]!;
}

async function confirmCode(view: PresentationView<MfaEnrolmentState, MfaEnrolmentAction>, confirms: readonly ConfirmEnrolmentRequest[], code = '123456') {
	const before = confirms.length;
	view.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'code', value: code } });
	view.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
	await vi.waitFor(() => expect(confirms).toHaveLength(before + 1));
	return confirms[before]!;
}

it('enrols once per owner, keeps the once-only codes, and reports only a real acknowledgement', async () => {
	const auth = createAuthFeature();
	const { deps, beginEnrolments, confirmEnrolments } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);
	const seen = observeOutcomes(store);

	store.dispatch({ type: 'openMfaEnrolment' });
	const view = enrolmentView(auth, store);
	// Acknowledging before any codes were shown is refused: nothing to route on.
	view.dispatch({ type: 'recoveryCodesAcknowledged' });
	expect(store.state.mfaOutcome).toBeNull();

	const begin = await startEnrolment(view, beginEnrolments);
	view.dispatch({ type: 'enrolmentRequested' });
	await settle();
	expect(beginEnrolments).toHaveLength(1);

	begin.resolve(START);
	await settle();
	expect(store.state.mfaEnrolment?.status).toBe('confirming');
	expect(store.state.mfaEnrolment?.secret).toBe(START.secret);

	const confirm = await confirmCode(view, confirmEnrolments);
	expect(confirm.enrolmentId).toBe('enr-1');
	expect(confirm.code).toBe('123456');
	confirm.resolve({ recoveryCodes: CODES });
	await settle();

	// Success is not acknowledgement: the owner stays, with its codes, and
	// nothing is reported until the user says they have saved them.
	expect(store.state.mfaEnrolment?.status).toBe('enrolled');
	expect(store.state.mfaEnrolment?.recoveryCodes).toEqual(CODES);
	expect(store.state.mfaOutcome).toBeNull();

	view.dispatch({ type: 'recoveryCodesAcknowledged' });
	expect(store.state.mfaOutcome).toEqual({ kind: 'enrolmentAcknowledged' });
	expect(store.state.mfaEnrolment?.recoveryCodes).toEqual(CODES);
	expect(store.state.mfaEnrolment?.acknowledged).toBe(true);

	// Once-only: a second click before the parent closes, and a replay of the
	// same routed action from the root, are both refused.
	const accepted = seen.find(({ outcome }) => outcome?.kind === 'enrolmentAcknowledged')!.action;
	const reduced = seen.length;
	view.dispatch({ type: 'recoveryCodesAcknowledged' });
	store.dispatch(accepted);
	expect(seen.length, 'both repeats were reduced, not dropped').toBe(reduced + 2);
	expect(seen.slice(reduced).map(({ outcome }) => outcome)).toEqual([null, null]);
	expect(store.state.mfaEnrolment?.recoveryCodes, 'the codes stay until the parent closes').toEqual(CODES);
	const acknowledged = seen.filter(({ outcome }) => outcome?.kind === 'enrolmentAcknowledged');
	expect(acknowledged).toHaveLength(1);

	// A pulse: the next reduction clears it.
	store.dispatch({ type: 'closeMfaEnrolment' });
	expect(store.state.mfaOutcome).toBeNull();
	expect(store.state.mfaEnrolment).toBeNull();
});

it('a restarted enrolment is a fresh owner: the old start is aborted and its late result dropped', async () => {
	const auth = createAuthFeature();
	const { deps, beginEnrolments } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);

	store.dispatch({ type: 'openMfaEnrolment' });
	const oldView = enrolmentView(auth, store);
	const oldBegin = await startEnrolment(oldView, beginEnrolments);

	// A second open is idempotent: the pending start keeps running.
	store.dispatch({ type: 'openMfaEnrolment' });
	expect(oldBegin.signal?.aborted).toBe(false);

	store.dispatch({ type: 'restartMfaEnrolment' });
	expect(oldBegin.signal?.aborted).toBe(true);
	const fresh = enrolmentView(auth, store);
	expect(fresh.state?.status).toBe('idle');
	// The old view is retired: its dispatches reach nothing.
	oldView.dispatch({ type: 'enrolmentRequested' });
	await settle();
	expect(beginEnrolments).toHaveLength(1);

	oldBegin.resolve(START);
	await settle();
	expect(store.state.mfaEnrolment?.status).toBe('idle');
	expect(store.state.mfaEnrolment?.secret).toBeNull();

	// The fresh owner may start its own enrolment.
	const next = await startEnrolment(fresh, beginEnrolments);
	expect(next.signal?.aborted).toBe(false);
});

it('management: one operation at a time, outcomes per matching success, and a routed re-authentication demand', async () => {
	const auth = createAuthFeature();
	const { deps, disableMfas, regenerateCodes } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);
	store.dispatch({ type: 'openMfaManagement' });
	const view = managementView(auth, store);
	view.dispatch({ type: 'mfaObserved', enabled: true });

	view.dispatch({ type: 'regenerateRequested' });
	view.dispatch({ type: 'disableRequested' });
	await vi.waitFor(() => expect(regenerateCodes).toHaveLength(1));
	await settle();
	expect(disableMfas).toHaveLength(0);

	regenerateCodes[0]!.resolve({ recoveryCodes: CODES });
	await vi.waitFor(() => expect(store.state.mfaManagement?.recoveryCodes).toEqual(CODES));
	// The pulse belongs to the success's own reduction; later ones have cleared it.
	const seen = observeOutcomes(store);

	view.dispatch({ type: 'disableRequested' });
	await vi.waitFor(() => expect(disableMfas).toHaveLength(1));
	disableMfas[0]!.reject(NEEDS_PROOF);
	await settle();
	const demand = seen.find(({ outcome }) => outcome?.kind === 'reauthenticationRequired');
	expect(demand?.outcome).toEqual({ kind: 'reauthenticationRequired', operation: 'disable', methods: ['password', 'totp'] });
	expect(store.state.mfaManagement?.operation).toBe('disable');

	// A stale success for an operation not in flight is refused, and reports nothing.
	view.dispatch({ type: 'disableSucceeded' });
	expect(store.state.mfaManagement?.status).toBe('idle');
	expect(store.state.mfaOutcome).toBeNull();

	// The parent's prompt succeeded; it retries the operation it was told about.
	view.dispatch({ type: 'disableRequested' });
	await vi.waitFor(() => expect(disableMfas).toHaveLength(2));
	disableMfas[1]!.resolve();
	await settle();
	expect(seen.filter(({ outcome }) => outcome?.kind === 'disabled')).toHaveLength(1);
	expect(store.state.mfaManagement?.status).toBe('disabled');
});

it('regeneration outcome is reported once per success, for each success', async () => {
	const auth = createAuthFeature();
	const { deps, regenerateCodes } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);
	const seen = observeOutcomes(store);
	store.dispatch({ type: 'openMfaManagement' });
	const view = managementView(auth, store);
	for (const round of [0, 1]) {
		view.dispatch({ type: 'regenerateRequested' });
		await vi.waitFor(() => expect(regenerateCodes).toHaveLength(round + 1));
		regenerateCodes[round]!.resolve({ recoveryCodes: [`code-${round}`] });
		await settle();
	}
	expect(seen.filter(({ outcome }) => outcome?.kind === 'recoveryCodesRegenerated')).toHaveLength(2);
});

it('settings flows outlive sign-in flows but not logout, which aborts and drops their operations', async () => {
	const auth = createAuthFeature();
	const { deps, beginEnrolments, disableMfas } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);

	store.dispatch({ type: 'openMfaManagement' });
	store.dispatch({ type: 'openMfaEnrolment' });
	// They coexist, and a temporary flow opened afterwards (a prompt) retires neither.
	store.dispatch({ type: 'openLogin' });
	expect(store.state.login).not.toBeNull();
	store.dispatch({ type: 'cancelSignIn' });
	expect(store.state.mfaManagement).not.toBeNull();
	expect(store.state.mfaEnrolment).not.toBeNull();

	const begin = await startEnrolment(enrolmentView(auth, store), beginEnrolments);
	managementView(auth, store).dispatch({ type: 'disableRequested' });
	await vi.waitFor(() => expect(disableMfas).toHaveLength(1));

	store.dispatch({ type: 'session', action: { type: 'logout' } });
	expect(store.state.mfaEnrolment).toBeNull();
	expect(store.state.mfaManagement).toBeNull();
	expect(begin.signal?.aborted).toBe(true);
	expect(disableMfas[0]!.signal?.aborted).toBe(true);

	begin.resolve(START);
	disableMfas[0]!.resolve();
	await settle();
	expect(store.state.mfaEnrolment).toBeNull();
	expect(store.state.mfaManagement).toBeNull();
	expect(store.state.mfaOutcome).toBeNull();

	// Opening while a temporary flow is live is refused.
	store.dispatch({ type: 'openLogin' });
	store.dispatch({ type: 'openMfaManagement' });
	expect(store.state.mfaManagement).toBeNull();
});

it('same-subject re-authentication keeps settings; an accepted switch of account retires them', async () => {
	const auth = createAuthFeature();
	const { deps, logins, beginEnrolments, regenerateCodes } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);

	async function signIn(expected: number) {
		store.dispatch({ type: 'openLogin' });
		const login = auth.composition.bind(store, auth.loginSlot)!;
		login.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'email', value: 'x@example.com' } });
		login.dispatch({ type: 'form', action: { type: 'fieldChanged', field: 'password', value: 'correct-horse' } });
		login.dispatch({ type: 'form', action: { type: 'submitTriggered' } });
		await vi.waitFor(() => expect(logins).toHaveLength(expected));
		return logins[expected - 1]!;
	}

	store.dispatch({ type: 'openMfaManagement' });
	managementView(auth, store).dispatch({ type: 'regenerateRequested' });
	await vi.waitFor(() => expect(regenerateCodes).toHaveLength(1));
	regenerateCodes[0]!.resolve({ recoveryCodes: CODES });
	await settle();
	expect(store.state.mfaManagement?.recoveryCodes).toEqual(CODES);

	// A re-authentication prompt as Ada: the panel and its codes survive.
	(await signIn(1)).resolve(ada);
	await settle();
	expect(store.state.handoff?.kind).toBe('accepted');
	expect(store.state.mfaManagement?.recoveryCodes).toEqual(CODES);

	// A pending enrolment and Ada's codes do not survive a sign-in as Bob.
	store.dispatch({ type: 'openMfaEnrolment' });
	const begin = await startEnrolment(enrolmentView(auth, store), beginEnrolments);
	(await signIn(2)).resolve(bob);
	await settle();
	expect(store.state.handoff).toEqual({ kind: 'accepted', source: 'login', session: bob });
	expect(store.state.mfaManagement).toBeNull();
	expect(store.state.mfaEnrolment).toBeNull();
	expect(begin.signal?.aborted).toBe(true);
	begin.resolve(START);
	await settle();
	expect(store.state.mfaEnrolment).toBeNull();
});

it('opens settings only for an authenticated subject', () => {
	const auth = createAuthFeature();
	const { deps } = controlledAuthDeps();
	for (const session of [createInitialSessionState(), { ...createInitialSessionState(), status: 'anonymous' as const }]) {
		const store = createAuthStore(auth, deps, { session });
		store.dispatch({ type: 'openMfaEnrolment' });
		store.dispatch({ type: 'openMfaManagement' });
		store.dispatch({ type: 'restartMfaEnrolment' });
		store.dispatch({ type: 'restartMfaManagement' });
		expect(store.state.mfaEnrolment, `refused while ${session.status}`).toBeNull();
		expect(store.state.mfaManagement, `refused while ${session.status}`).toBeNull();
		store.dispatch({ type: 'session', action: { type: 'sessionEstablished', session: ada } });
		store.dispatch({ type: 'openMfaManagement' });
		expect(store.state.mfaManagement).not.toBeNull();
	}
});

it('settings seeded before the session resolved do not survive its resolution to a subject', () => {
	const auth = createAuthFeature();
	const { deps } = controlledAuthDeps();
	const store = createAuthStore(auth, deps, {
		session: createInitialSessionState(),
		mfaEnrolment: { ...createInitialMfaEnrolmentState(), status: 'confirming', enrolmentId: 'enr-x', secret: 'SEEDED', otpauthUri: 'otpauth://x' },
		mfaManagement: { ...createInitialMfaManagementState(), recoveryCodes: CODES }
	});
	store.dispatch({ type: 'session', action: { type: 'sessionEstablished', session: bob } });
	expect(store.state.mfaEnrolment).toBeNull();
	expect(store.state.mfaManagement).toBeNull();
});

it('an expiry to anonymous retires settings and aborts their requests', async () => {
	const auth = createAuthFeature();
	const { deps, beginEnrolments, regenerateCodes } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);
	store.dispatch({ type: 'openMfaEnrolment' });
	store.dispatch({ type: 'openMfaManagement' });
	const begin = await startEnrolment(enrolmentView(auth, store), beginEnrolments);
	managementView(auth, store).dispatch({ type: 'regenerateRequested' });
	await vi.waitFor(() => expect(regenerateCodes).toHaveLength(1));

	// A re-check finds no session (`controlledAuthDeps.fetchSession` returns null).
	store.dispatch({ type: 'session', action: { type: 'resolveSession' } });
	await vi.waitFor(() => expect(store.state.session.status).toBe('anonymous'));
	expect(store.state.mfaEnrolment).toBeNull();
	expect(store.state.mfaManagement).toBeNull();
	expect(begin.signal?.aborted).toBe(true);
	expect(regenerateCodes[0]!.signal?.aborted).toBe(true);
	begin.resolve(START);
	regenerateCodes[0]!.resolve({ recoveryCodes: CODES });
	await settle();
	expect(store.state.mfaEnrolment).toBeNull();
	expect(store.state.mfaManagement).toBeNull();
	expect(store.state.mfaOutcome).toBeNull();
});

it('a replayed management result reports nothing, for every result the reducer accepted once', async () => {
	const auth = createAuthFeature();
	const { deps, disableMfas, regenerateCodes } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);
	const seen = observeOutcomes(store);
	store.dispatch({ type: 'openMfaManagement' });
	const view = managementView(auth, store);

	/** Settle the request, then replay the exact routed action that reported. */
	async function reportsOnce(settleRequest: () => void, kind: string) {
		const before = seen.length;
		settleRequest();
		await settle();
		const reported = seen.slice(before).filter(({ outcome }) => outcome?.kind === kind);
		expect(reported, `one ${kind}`).toHaveLength(1);
		const snapshotBefore = store.state.mfaManagement;
		const reduced = seen.length;
		store.dispatch(reported[0]!.action);
		expect(seen.length, 'the replay was reduced, not dropped').toBe(reduced + 1);
		expect(seen.at(-1)!.outcome, `a replayed ${kind} reported again`).toBeNull();
		expect(store.state.mfaManagement?.status).toBe(snapshotBefore?.status);
	}

	view.dispatch({ type: 'regenerateRequested' });
	await vi.waitFor(() => expect(regenerateCodes).toHaveLength(1));
	await reportsOnce(() => regenerateCodes[0]!.reject(NEEDS_PROOF), 'reauthenticationRequired');

	view.dispatch({ type: 'regenerateRequested' });
	await vi.waitFor(() => expect(regenerateCodes).toHaveLength(2));
	await reportsOnce(() => regenerateCodes[1]!.resolve({ recoveryCodes: CODES }), 'recoveryCodesRegenerated');
	expect(store.state.mfaManagement?.recoveryCodes, 'the replay did not re-show or clear codes').toEqual(CODES);

	view.dispatch({ type: 'disableRequested' });
	await vi.waitFor(() => expect(disableMfas).toHaveLength(1));
	await reportsOnce(() => disableMfas[0]!.reject(NEEDS_PROOF), 'reauthenticationRequired');
	expect(store.state.mfaManagement?.operation).toBe('disable');

	view.dispatch({ type: 'disableRequested' });
	await vi.waitFor(() => expect(disableMfas).toHaveLength(2));
	await reportsOnce(() => disableMfas[1]!.resolve(), 'disabled');

	// Operation-specific demands: one per operation, with the backend's methods.
	const demands = seen.filter(({ outcome }) => outcome?.kind === 'reauthenticationRequired').map(({ outcome }) => outcome);
	expect(demands).toEqual([
		{ kind: 'reauthenticationRequired', operation: 'regenerate', methods: ['password', 'totp'] },
		{ kind: 'reauthenticationRequired', operation: 'disable', methods: ['password', 'totp'] }
	]);
});

it('closing retires pending operations; a retired view cannot report an outcome', async () => {
	const auth = createAuthFeature();
	const { deps, regenerateCodes } = controlledAuthDeps();
	const store = createAuthStore(auth, deps);
	store.dispatch({ type: 'openMfaManagement' });
	const view = managementView(auth, store);
	view.dispatch({ type: 'regenerateRequested' });
	await vi.waitFor(() => expect(regenerateCodes).toHaveLength(1));
	store.dispatch({ type: 'closeMfaManagement' });
	expect(regenerateCodes[0]!.signal?.aborted).toBe(true);
	store.dispatch({ type: 'openMfaManagement' });
	const seen = observeOutcomes(store);
	regenerateCodes[0]!.resolve({ recoveryCodes: CODES });
	view.dispatch({ type: 'recoveryCodesAcknowledged' });
	await settle();
	expect(seen.some(({ outcome }) => outcome !== null)).toBe(false);
	expect(store.state.mfaManagement?.recoveryCodes).toBeNull();
});

it('keeps enrolment and management operations isolated across sibling auth features', async () => {
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
	const { deps, beginEnrolments, disableMfas } = controlledAuthDeps();
	const store = createStore({
		initialState: {
			a: { ...auth.initialState(), session: signedIn(ada) },
			b: { ...auth.initialState(), session: signedIn(bob) }
		} satisfies State,
		reducer: app.reducer,
		execution: app.execution,
		dependencies: deps
	});
	stores.push(store);

	for (const slot of [a, b]) {
		const feature = app.bind(store, slot)!;
		feature.dispatch({ type: 'openMfaEnrolment' });
		feature.dispatch({ type: 'openMfaManagement' });
		app.bind(store, nestedSlot(slot, auth.mfaEnrolmentSlot))!.dispatch({ type: 'enrolmentRequested' });
		app.bind(store, nestedSlot(slot, auth.mfaManagementSlot))!.dispatch({ type: 'disableRequested' });
	}
	await vi.waitFor(() => {
		expect(beginEnrolments).toHaveLength(2);
		expect(disableMfas).toHaveLength(2);
	});
	// The same fixed effect IDs, and yet neither sibling's start cancelled the other's.
	for (const request of [...beginEnrolments, ...disableMfas]) expect(request.signal?.aborted).toBe(false);

	store.dispatch({ type: 'removeA' });
	expect(beginEnrolments[0]!.signal?.aborted).toBe(true);
	expect(disableMfas[0]!.signal?.aborted).toBe(true);
	expect(beginEnrolments[1]!.signal?.aborted).toBe(false);
	expect(disableMfas[1]!.signal?.aborted).toBe(false);

	beginEnrolments[0]!.resolve({ ...START, enrolmentId: 'enr-a' });
	disableMfas[0]!.resolve();
	beginEnrolments[1]!.resolve({ ...START, enrolmentId: 'enr-b' });
	disableMfas[1]!.reject(NEEDS_PROOF);
	await settle();
	expect(store.state.a).toBeNull();
	expect(store.state.b?.mfaEnrolment?.enrolmentId).toBe('enr-b');
	expect(store.state.b?.mfaManagement?.status).toBe('idle');
	expect(store.state.b?.mfaManagement?.operation).toBe('disable');
});
