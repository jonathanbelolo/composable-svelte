/**
 * The MFA components — browser mode.
 *
 * The arm that closes the gap is `hands the challenge from LoginForm to the
 * challenge form`: two components, a real login failure, and the id arriving
 * where it can be used. Everything before this only ever proved the id existed.
 *
 * The other one worth naming is `does not show a red banner when the consumer
 * is handling it`. `mfa_required` is the flow branching, not a failure, and
 * telling a user something went wrong on the way to a code prompt is both wrong
 * and alarming.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import LoginForm from '../src/lib/components/LoginForm.svelte';
import MfaChallengeForm from '../src/lib/components/MfaChallengeForm.svelte';
import MfaEnrolment from '../src/lib/components/MfaEnrolment.svelte';
import OneTimeCodeInput from '../src/lib/components/OneTimeCodeInput.svelte';
import { createInitialLoginState, loginReducer } from '../src/lib/flows/login/reducer.js';
import {
	createInitialMfaChallengeState,
	mfaChallengeReducer
} from '../src/lib/flows/mfa-challenge/reducer.js';
import {
	createInitialMfaEnrolmentState,
	mfaEnrolmentReducer
} from '../src/lib/flows/mfa-enrolment/reducer.js';
import type { MfaChallengeDependencies } from '../src/lib/flows/mfa-challenge/types.js';
import type { MfaEnrolmentDependencies } from '../src/lib/flows/mfa-enrolment/types.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { MfaMethod } from '../src/lib/deps.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: 'dd000000-0000-4000-8000-00000000000d',
	display_name: 'Ada',
	roles: ['member']
};

const MFA_REQUIRED: AuthError = {
	code: 'mfa_required',
	message: 'Enter the code from your authenticator app.',
	challengeId: 'chal_live',
	methods: ['totp', 'recovery_code']
};

const inertSessionDeps: SessionDependencies = {
	fetchLogin: async () => session,
	fetchLogout: async () => undefined,
	fetchSession: async () => null
};

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

function sessionSpy() {
	const real = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertSessionDeps
	});
	const actions: Array<{ type: string }> = [];
	return {
		actions,
		store: {
			dispatch(action: Parameters<typeof real.dispatch>[0]) {
				actions.push(action);
				real.dispatch(action);
			}
		}
	};
}

// ============================================================
// The handoff
// ============================================================

describe('the handoff from sign-in', () => {
	it('hands the challenge from LoginForm to the challenge form', async () => {
		// The arm this whole slice exists for. Two real components, a real
		// `mfa_required`, and the id reaching the verify call — the journey the
		// union was designed for and which nothing has ever completed.
		const target = mountTarget();
		const loginFlow = createStore({
			initialState: createInitialLoginState(),
			reducer: loginReducer,
			dependencies: {
				login: vi.fn(async () => {
					throw MFA_REQUIRED;
				})
			}
		});
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(
			async () => session
		);
		const challengeFlow = createStore({
			initialState: createInitialMfaChallengeState(null, ['totp']),
			reducer: mfaChallengeReducer,
			dependencies: { verifyMfaChallenge }
		});
		const spy = sessionSpy();

		let handed: { challengeId: string; methods: readonly MfaMethod[] } | undefined;
		const login = mount(LoginForm, {
			target,
			props: {
				flowStore: loginFlow,
				sessionStore: spy.store,
				onMfaRequired: (challenge: { challengeId: string; methods: readonly MfaMethod[] }) => {
					handed = challenge;
					challengeFlow.dispatch({ type: 'challengeProvided', ...challenge });
				}
			} as never
		});

		try {
			await userEvent.fill(target.querySelector('input[type="email"]')!, 'ada@example.com');
			await userEvent.fill(target.querySelector('input[name="password"]')!, 'hunter2');
			flushSync();
			await userEvent.click(target.querySelector('button[type="submit"]')!);

			await vi.waitFor(() => {
				flushSync();
				expect(handed, 'the login never handed the challenge over').toBeDefined();
			});
			expect(handed!.challengeId).toBe('chal_live');
			expect(handed!.methods).toEqual(['totp', 'recovery_code']);
			expect(spy.actions, 'a session was established before the second factor').toEqual([]);
		} finally {
			unmount(login);
			target.remove();
		}

		// Now the challenge form, holding what the login gave it.
		const target2 = mountTarget();
		const spy2 = sessionSpy();
		const challenge = mount(MfaChallengeForm, {
			target: target2,
			props: {
				flowStore: challengeFlow,
				sessionStore: spy2.store,
				onStartOver: () => {}
			} as never
		});

		try {
			await userEvent.fill(target2.querySelector('input')!, '123456');
			flushSync();
			await userEvent.click(target2.querySelector('button[type="submit"]')!);

			await vi.waitFor(() => {
				flushSync();
				expect(spy2.actions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});

			expect(verifyMfaChallenge).toHaveBeenCalledWith(
				'chal_live',
				'123456',
				'totp',
				expect.anything()
			);
		} finally {
			unmount(challenge);
			target2.remove();
		}
	});

	it('does not show a red banner when the consumer is handling it', async () => {
		// It is the flow branching, not a failure. A `role="alert"` on the way to
		// a code prompt tells the user something went wrong when nothing did.
		const target = mountTarget();
		const flowStore = createStore({
			initialState: createInitialLoginState(),
			reducer: loginReducer,
			dependencies: {
				login: vi.fn(async () => {
					throw MFA_REQUIRED;
				})
			}
		});
		const spy = sessionSpy();
		const component = mount(LoginForm, {
			target,
			props: { flowStore, sessionStore: spy.store, onMfaRequired: () => {} } as never
		});

		try {
			await userEvent.fill(target.querySelector('input[type="email"]')!, 'ada@example.com');
			await userEvent.fill(target.querySelector('input[name="password"]')!, 'hunter2');
			flushSync();
			await userEvent.click(target.querySelector('button[type="submit"]')!);

			await vi.waitFor(() => {
				flushSync();
				expect(flowStore.state.error?.code).toBe('mfa_required');
			});

			expect(
				target.querySelector('[data-error-code]'),
				'a failure banner was shown for a branch, not a failure'
			).toBeNull();
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('still shows the banner when nothing is handling it', async () => {
		// Non-vacuity, and the pre-existing behaviour: a consumer without MFA
		// support should not silently swallow the message.
		const target = mountTarget();
		const flowStore = createStore({
			initialState: createInitialLoginState(),
			reducer: loginReducer,
			dependencies: {
				login: vi.fn(async () => {
					throw MFA_REQUIRED;
				})
			}
		});
		const spy = sessionSpy();
		const component = mount(LoginForm, {
			target,
			props: { flowStore, sessionStore: spy.store } as never
		});

		try {
			await userEvent.fill(target.querySelector('input[type="email"]')!, 'ada@example.com');
			await userEvent.fill(target.querySelector('input[name="password"]')!, 'hunter2');
			flushSync();
			await userEvent.click(target.querySelector('button[type="submit"]')!);

			await vi.waitFor(() => {
				flushSync();
				expect(target.querySelector('[data-error-code]')).not.toBeNull();
			});
			expect(target.querySelector('[data-error-code]')!.getAttribute('data-error-code')).toBe(
				'mfa_required'
			);
		} finally {
			unmount(component);
			target.remove();
		}
	});
});

// ============================================================
// The challenge form
// ============================================================

function mountChallenge(
	deps: MfaChallengeDependencies,
	props: Record<string, unknown> = {},
	challengeId: string | null = 'chal_1',
	methods: readonly MfaMethod[] = ['totp', 'recovery_code']
) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialMfaChallengeState(challengeId, methods),
		reducer: mfaChallengeReducer,
		dependencies: deps
	});
	const spy = sessionSpy();
	const component = mount(MfaChallengeForm, {
		target,
		props: {
			flowStore,
			sessionStore: spy.store,
			onStartOver: () => {},
			...props
		} as never
	});
	return {
		target,
		component,
		flowStore,
		sessionActions: spy.actions,
		text: () => target.textContent ?? '',
		code: () => target.querySelector('input') as HTMLInputElement,
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		banner: () => target.querySelector('[data-error-code]'),
		button: (label: string) =>
			[...target.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(label)),
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('the challenge form', () => {
	it('offers a recovery code, and sends it as a different method', async () => {
		// The way back in after a lost phone — the reason recovery codes exist.
		const verifyMfaChallenge: MfaChallengeDependencies['verifyMfaChallenge'] = vi.fn(
			async () => session
		);
		const h = mountChallenge({ verifyMfaChallenge });

		try {
			expect(h.code().getAttribute('autocomplete'), 'the OS cannot autofill this').toBe(
				'one-time-code'
			);

			await userEvent.click(h.button('Use a recovery code')!);
			flushSync();

			expect(h.text()).toContain('Use a recovery code');
			expect(
				h.code().getAttribute('autocomplete'),
				'offered an SMS autofill for a recovery code'
			).toBe('off');

			await userEvent.fill(h.code(), 'abcd-efgh');
			flushSync();
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(verifyMfaChallenge).toHaveBeenCalledWith(
					'chal_1',
					'abcd-efgh',
					'recovery_code',
					expect.anything()
				);
			});
		} finally {
			h.cleanup();
		}
	});

	it('offers no switch when the account has only one factor', async () => {
		// Non-vacuity for the arm above: a control that cannot work must not be
		// rendered.
		const h = mountChallenge(
			{ verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge'] },
			{},
			'chal_1',
			['totp']
		);
		try {
			flushSync();
			expect(h.button('Use a recovery code')).toBeUndefined();
		} finally {
			h.cleanup();
		}
	});

	it('keeps the form up for a wrong code', async () => {
		// Retryable. Withdrawing it would make a typo unrecoverable.
		const h = mountChallenge({
			verifyMfaChallenge: vi.fn(async () => {
				throw { code: 'invalid_credentials', message: 'That code is not right.' } satisfies AuthError;
			})
		});

		try {
			await userEvent.fill(h.code(), '000000');
			flushSync();
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});
			expect(h.banner()!.getAttribute('data-error-code')).toBe('invalid_credentials');
			expect(h.code(), 'a retryable failure withdrew the form').not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('withdraws the form for an expired challenge, and offers a way out', async () => {
		// Not retryable — the sign-in has to begin again — so leaving the form up
		// invites the user to try something that cannot work.
		const onStartOver = vi.fn();
		const h = mountChallenge(
			{
				verifyMfaChallenge: vi.fn(async () => {
					throw { code: 'token_expired', message: 'That attempt expired.' } satisfies AuthError;
				})
			},
			{ onStartOver }
		);

		try {
			await userEvent.fill(h.code(), '123456');
			flushSync();
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('expired');
			});

			expect(h.code(), 'a form was left up that cannot succeed').toBeNull();
			await userEvent.click(h.button('Back to sign in')!);
			expect(onStartOver).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('shows nothing to verify when it has no challenge', async () => {
		const h = mountChallenge(
			{ verifyMfaChallenge: vi.fn() as unknown as MfaChallengeDependencies['verifyMfaChallenge'] },
			{},
			null
		);
		try {
			flushSync();
			expect(h.text()).toContain('Nothing to verify');
			expect(h.code()).toBeNull();
			expect(h.button('Back to sign in'), 'a dead end with nothing to click').toBeDefined();
		} finally {
			h.cleanup();
		}
	});
});

// ============================================================
// Enrolment
// ============================================================

function mountEnrolment(deps: Partial<MfaEnrolmentDependencies> = {}, props: Record<string, unknown> = {}) {
	const target = mountTarget();
	const beginMfaEnrolment = vi.fn(async () => ({
		enrolmentId: 'enr_1',
		secret: 'JBSWY3DPEHPK3PXP',
		otpauthUri: 'otpauth://totp/Example:ada@example.com?secret=JBSWY3DPEHPK3PXP'
	}));
	const flowStore = createStore({
		initialState: createInitialMfaEnrolmentState(),
		reducer: mfaEnrolmentReducer,
		dependencies: {
			beginMfaEnrolment,
			confirmMfaEnrolment: vi.fn(async () => ({ recoveryCodes: ['aaa-111', 'bbb-222'] })),
			...deps
		}
	});
	const component = mount(MfaEnrolment, { target, props: { flowStore, ...props } as never });
	return {
		target,
		component,
		flowStore,
		beginMfaEnrolment,
		text: () => target.textContent ?? '',
		code: () => target.querySelector('input') as HTMLInputElement | null,
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

describe('enrolment', () => {
	it('shows the secret for manual entry, with or without a QR', async () => {
		// No QR is a supported configuration, not a degraded one: manual entry is
		// the only route available to someone setting up on the same device.
		const h = mountEnrolment();
		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('JBSWY3DPEHPK3PXP');
			});
			expect(h.text()).toContain('Add this key to your authenticator app');
		} finally {
			h.cleanup();
		}
	});

	it('gives the qr snippet the uri and the secret', async () => {
		const h = mountEnrolment(
			{},
			{
				qr: createRawSnippet<[{ otpauthUri: string; secret: string }]>((getArgs) => ({
					render: () => `<p data-testid="qr">${getArgs().otpauthUri}</p>`
				}))
			}
		);
		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelector('[data-testid="qr"]')).not.toBeNull();
			});
			expect(h.target.querySelector('[data-testid="qr"]')!.textContent).toContain('otpauth://totp/');
			expect(h.text(), 'the copy changed to assume a QR was there').toContain('Scan the code above');
		} finally {
			h.cleanup();
		}
	});

	it('starts exactly once, however often the effect runs', async () => {
		// A second start issues a new secret and silently invalidates the one the
		// user is halfway through typing into their phone.
		const h = mountEnrolment();
		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.beginMfaEnrolment).toHaveBeenCalledTimes(1);
			});

			for (let i = 0; i < 5; i++) {
				h.flowStore.dispatch({ type: 'errorDismissed' });
				flushSync();
			}
			await new Promise((resolve) => setTimeout(resolve, 20));

			expect(h.beginMfaEnrolment, 'the secret was reissued').toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('shows the recovery codes once, and does not leave on its own', async () => {
		// They can never be retrieved again, so leaving is the user's decision to
		// make rather than a transition to fire on their behalf.
		const onDone = vi.fn();
		const h = mountEnrolment({}, { onDone });

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.code()).not.toBeNull();
			});

			await userEvent.fill(h.code()!, '123456');
			flushSync();
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Save your recovery codes');
			});

			expect(h.text()).toContain('aaa-111');
			expect(h.text()).toContain('bbb-222');
			expect(onDone, 'left the panel without the user acknowledging').not.toHaveBeenCalled();

			const panel = h.target.querySelector('[role="status"]') as HTMLElement;
			expect(document.activeElement, 'focus was stranded').toBe(panel);

			await userEvent.click(
				[...h.target.querySelectorAll('button')].find((b) =>
					b.textContent?.includes('I have saved them')
				)!
			);
			expect(onDone).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('keeps the secret on screen when the code is wrong', async () => {
		// Starting over would throw away an enrolment one correct code from
		// finishing, along with the secret already in the user's app.
		const h = mountEnrolment({
			confirmMfaEnrolment: vi.fn(async () => {
				throw { code: 'invalid_credentials', message: 'That code is not right.' } satisfies AuthError;
			})
		});

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.code()).not.toBeNull();
			});

			await userEvent.fill(h.code()!, '000000');
			flushSync();
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelector('[data-error-code]')).not.toBeNull();
			});

			expect(h.text(), 'the secret was thrown away on a typo').toContain('JBSWY3DPEHPK3PXP');
			expect(h.code(), 'the form was withdrawn on a retryable failure').not.toBeNull();
		} finally {
			h.cleanup();
		}
	});

	it('offers a retry when the start fails', async () => {
		const beginMfaEnrolment = vi
			.fn<MfaEnrolmentDependencies['beginMfaEnrolment']>()
			.mockRejectedValueOnce({ code: 'rate_limited', message: 'Slow down.' })
			.mockResolvedValueOnce({ enrolmentId: 'enr_2', secret: 'SECRET2', otpauthUri: 'otpauth://x' });
		const h = mountEnrolment({ beginMfaEnrolment });

		try {
			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('Could not start setup');
			});

			await userEvent.click(
				[...h.target.querySelectorAll('button')].find((b) => b.textContent?.includes('Try again'))!
			);

			await vi.waitFor(() => {
				flushSync();
				expect(h.text()).toContain('SECRET2');
			});
		} finally {
			h.cleanup();
		}
	});
});

describe('OneTimeCodeInput', () => {
	it('is one field, not six', () => {
		// The design decision, asserted rather than left to a comment. Split boxes
		// would be six inputs and would have to re-implement paste.
		const target = mountTarget();
		const component = mount(OneTimeCodeInput, {
			target,
			props: { id: 'c', value: '', oninput: () => {} }
		});
		try {
			expect(target.querySelectorAll('input').length).toBe(1);
			const input = target.querySelector('input')!;
			expect(input.getAttribute('inputmode')).toBe('numeric');
			expect(input.type, 'a number input drops leading zeros').toBe('text');
			expect(input.getAttribute('autocomplete')).toBe('one-time-code');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('does not truncate a longer code', () => {
		// `maxlength` is a hint and unset by default: a recovery code is a
		// different shape from a TOTP code, and truncating a paste is worse than
		// letting the backend judge.
		const target = mountTarget();
		const component = mount(OneTimeCodeInput, {
			target,
			props: { id: 'c', value: '', oninput: () => {} }
		});
		try {
			expect(target.querySelector('input')!.hasAttribute('maxlength')).toBe(false);
		} finally {
			unmount(component);
			target.remove();
		}
	});
});
