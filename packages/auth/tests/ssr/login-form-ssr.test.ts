/**
 * `LoginForm` rendered by the server.
 *
 * Browser mode never compiles this path. `packages/chat` learned that the hard
 * way — a regression emptied its server HTML of video embeds, shipped, and was
 * cleared as harmless — which is why it grew a config exactly like this one. A
 * sign-in page is the single most likely thing in this package to be server
 * rendered, and it had no coverage here at all.
 *
 * The assertions are the things that can differ between the two builds:
 * anything a `$effect` would have produced (effects do not run on the server),
 * a dynamic `<svelte:element>` tag, and the attributes that come from
 * `$props.id()`.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'svelte/server';
import { createStore } from '@composable-svelte/core';

import LoginForm from '../../src/lib/components/LoginForm.svelte';
import SignupForm from '../../src/lib/components/SignupForm.svelte';
import EmailVerification from '../../src/lib/components/EmailVerification.svelte';
import ForgotPasswordForm from '../../src/lib/components/ForgotPasswordForm.svelte';
import ResetPasswordForm from '../../src/lib/components/ResetPasswordForm.svelte';
import MfaChallengeForm from '../../src/lib/components/MfaChallengeForm.svelte';
import MfaEnrolment from '../../src/lib/components/MfaEnrolment.svelte';
import OAuthSignIn from '../../src/lib/components/OAuthSignIn.svelte';
import OAuthCallback from '../../src/lib/components/OAuthCallback.svelte';
import { createInitialLoginState, loginReducer } from '../../src/lib/flows/login/reducer.js';
import { createInitialSignupState, signupReducer } from '../../src/lib/flows/signup/reducer.js';
import {
	createInitialEmailVerificationState,
	emailVerificationReducer
} from '../../src/lib/flows/email-verification/reducer.js';
import {
	createInitialForgotPasswordState,
	forgotPasswordReducer
} from '../../src/lib/flows/forgot-password/reducer.js';
import {
	createInitialResetPasswordState,
	resetPasswordReducer
} from '../../src/lib/flows/reset-password/reducer.js';
import {
	createInitialMfaChallengeState,
	mfaChallengeReducer
} from '../../src/lib/flows/mfa-challenge/reducer.js';
import {
	createInitialOAuthStartState,
	oauthStartReducer,
	createInitialOAuthCallbackState,
	oauthCallbackReducer,
	createPendingOAuthStorage,
	createBrowserRedirect
} from '../../src/lib/flows/index.js';
import {
	createInitialMfaEnrolmentState,
	mfaEnrolmentReducer
} from '../../src/lib/flows/mfa-enrolment/reducer.js';
import { createInitialSessionState, sessionReducer } from '../../src/lib/session/reducer.js';
import type { LoginState } from '../../src/lib/flows/login/types.js';
import type { SessionSnapshot } from '../../src/lib/subject/types.js';

const session: SessionSnapshot = { subject_id: 'a', display_name: 'Ada', roles: ['member'] };

function serverHtml(initial?: Partial<LoginState>, props: Record<string, unknown> = {}) {
	const flowStore = createStore({
		initialState: { ...createInitialLoginState(), ...initial },
		reducer: loginReducer,
		dependencies: { login: async () => session }
	});
	const sessionStore = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: {
			fetchLogin: async () => session,
			fetchLogout: async () => undefined,
			fetchSession: async () => null
		}
	});
	return render(LoginForm, { props: { flowStore, sessionStore, ...props } }).body;
}

describe('the server build', () => {
	it('emits a usable form, not an empty shell', () => {
		// The `chat` failure mode: markup present, contents gone. Each control is
		// named rather than counting bytes, because a shell is also long.
		const body = serverHtml();

		expect(body).toContain('type="email"');
		expect(body).toContain('type="password"');
		expect(body).toContain('type="checkbox"');
		expect(body).toContain('type="submit"');
		expect(body).toContain('Sign in');
	});

	it('renders the dynamic heading tag', () => {
		// `<svelte:element this={`h${headingLevel}`}>` is computed markup, the kind
		// of thing that can resolve to nothing on one build and not the other.
		expect(serverHtml()).toMatch(/<h2[^>]*class="[^"]*login-form__title/);
		expect(serverHtml(undefined, { headingLevel: 1 })).toMatch(
			/<h1[^>]*class="[^"]*login-form__title/
		);
	});

	it('carries seeded values into the markup', () => {
		// A server-rendered form that arrives blank and fills in on hydration is a
		// visible flash, and for a remembered address it is the whole point of
		// rendering it on the server.
		expect(serverHtml({ form: createInitialLoginState({ email: 'ada@example.com' }).form })).toContain(
			'ada@example.com'
		);
	});

	it('keeps the password hidden before hydration', () => {
		// `visible` is `$state` initialised to `false`; if the server ever emitted
		// `type="text"` the password would be legible for the length of the
		// hydration gap, in markup that could also be cached.
		const body = serverHtml({ form: createInitialLoginState({ password: 'hunter2' }).form });

		expect(body).toContain('type="password"');
		expect(body).not.toMatch(/type="text"/);
		expect(body).toContain('aria-pressed="false"');
	});

	it('wires labels to controls without an effect having run', () => {
		// Effects do not run on the server. The ids come from `$props.id()`, which
		// does — so every `for` must already resolve in this markup.
		const body = serverHtml();
		const ids = [...body.matchAll(/<input[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
		const fors = [...body.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);

		expect(ids.length, 'no inputs carried an id').toBe(3);
		expect(fors.length).toBe(3);
		for (const target of fors) expect(ids, `label points at missing ${target}`).toContain(target);
	});

	it('renders a failure the server already knows about', () => {
		// SSR of a POST-then-render sign-in: the error is in the state before the
		// first paint, and `role="alert"` has to be in the markup for it.
		const body = serverHtml({
			error: { code: 'invalid_credentials', message: 'That did not match an account.' }
		});

		expect(body).toContain('data-error-code="invalid_credentials"');
		expect(body).toContain('role="alert"');
		expect(body).toContain('That did not match an account.');
	});

	it('announces nothing at rest', () => {
		// The live region must arrive empty. Server markup that already said
		// "Signing in…" would announce a request that is not happening.
		const body = serverHtml();

		expect(body).toContain('role="status"');
		expect(body).not.toContain('Signing in');
	});
});

describe('the server build of SignupForm', () => {
	function signupHtml(initial: Partial<ReturnType<typeof createInitialSignupState>> = {}) {
		const flowStore = createStore({
			initialState: { ...createInitialSignupState(), ...initial },
			reducer: signupReducer,
			dependencies: {
				signup: async () => ({ kind: 'verificationRequired' as const, email: 'g@example.com' })
			}
		});
		const sessionStore = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: {
				fetchLogin: async () => session,
				fetchLogout: async () => undefined,
				fetchSession: async () => null
			}
		});
		return render(SignupForm, { props: { flowStore, sessionStore } }).body;
	}

	it('emits three fields, all of them hidden', () => {
		// Two password fields now, and neither may arrive legible. `visible` is
		// `$state(false)`; a server build that got it wrong would expose both for
		// the length of the hydration gap, in markup that could also be cached.
		const body = signupHtml();

		expect(body).toContain('type="email"');
		expect((body.match(/type="password"/g) ?? []).length).toBe(2);
		expect(body).not.toMatch(/type="text"/);
	});

	it('renders the criteria list, unmet and not announced', () => {
		// `PasswordCriteria` is `$derived`, not an effect, so it must be complete
		// in the server markup — a checklist that appears only after hydration is
		// a flash on the most security-sensitive field on the page.
		const body = signupHtml();

		expect(body).toContain('Password requirements');
		expect(body).toContain('Not met');
		// Deliberately not a live region: announcing per keystroke is unusable.
		expect(body).not.toMatch(/aria-live="polite"[^>]*>\s*<li/);
	});

	it('renders the terminal panel from state alone', () => {
		// `awaitingVerification` is reachable on the server after a POST-then-
		// render signup, and effects do not run there — so the panel has to come
		// out of state, not out of an effect.
		const body = signupHtml({ status: 'awaitingVerification', pendingEmail: 'grace@example.com' });

		expect(body).toContain('Check your email');
		expect(body).toContain('grace@example.com');
		expect(body, 'the form rendered behind the terminal panel').not.toContain('type="email"');
	});
});

describe('the server build of EmailVerification', () => {
	function verifyHtml(
		initial: Partial<ReturnType<typeof createInitialEmailVerificationState>> = {},
		token: string | null = null
	) {
		const flowStore = createStore({
			initialState: { ...createInitialEmailVerificationState('ada@example.com'), ...initial },
			reducer: emailVerificationReducer,
			dependencies: {
				verifyEmail: async () => null,
				resendVerification: async () => undefined
			}
		});
		const sessionStore = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: {
				fetchLogin: async () => session,
				fetchLogout: async () => undefined,
				fetchSession: async () => null
			}
		});
		return render(EmailVerification, { props: { flowStore, sessionStore, token } }).body;
	}

	it('does not exchange the token while rendering', () => {
		// Effects do not run on the server, which is the behaviour this component
		// depends on: exchanging a single-use token during SSR would spend it
		// before the page ever reached the browser, and a cached render would
		// spend one per request.
		const body = verifyHtml({}, 'tok_1');

		expect(body).not.toContain('Email confirmed');
		expect(body).toContain('Send another link');
	});

	it('renders the confirmed panel from state alone', () => {
		const body = verifyHtml({ status: 'verified' });

		expect(body).toContain('Email confirmed');
		expect(body).toContain('You can sign in now');
	});

	it('renders a dead link and its way out', () => {
		const body = verifyHtml(
			{ error: { code: 'token_expired', message: 'That link is no longer valid.' } },
			'stale'
		);

		expect(body).toContain('data-error-code="token_expired"');
		expect(body).toContain('That link did not work');
		expect(body).toContain('ada@example.com');
	});
});

describe('the server build of the recovery pair', () => {
	const inertSession = () =>
		createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: {
				fetchLogin: async () => session,
				fetchLogout: async () => undefined,
				fetchSession: async () => null
			}
		});

	it('renders the request form, with nothing claimed yet', () => {
		const flowStore = createStore({
			initialState: createInitialForgotPasswordState(),
			reducer: forgotPasswordReducer,
			dependencies: { requestPasswordReset: async () => undefined }
		});
		const body = render(ForgotPasswordForm, { props: { flowStore } }).body;

		expect(body).toContain('type="email"');
		expect(body, 'a confirmation rendered before anything was asked').not.toContain('is on its way');
	});

	it('renders the conditional confirmation from state alone', () => {
		// Reachable on the server after a POST-then-render, and effects do not run
		// there — so the wording has to come out of state.
		const flowStore = createStore({
			initialState: {
				...createInitialForgotPasswordState(),
				status: 'sent' as const,
				requestedFor: 'ada@example.com'
			},
			reducer: forgotPasswordReducer,
			dependencies: { requestPasswordReset: async () => undefined }
		});
		const body = render(ForgotPasswordForm, { props: { flowStore } }).body;

		expect(body).toContain('If there is an account');
		expect(body).toContain('ada@example.com');
		expect(body, 'the form was replaced rather than kept').toContain('type="email"');
	});

	it('renders the reset form with both passwords hidden', () => {
		const flowStore = createStore({
			initialState: createInitialResetPasswordState('tok_1'),
			reducer: resetPasswordReducer,
			dependencies: { resetPassword: async () => null }
		});
		const body = render(ResetPasswordForm, {
			props: { flowStore, sessionStore: inertSession(), onRequestNewLink: () => {} }
		}).body;

		expect((body.match(/type="password"/g) ?? []).length).toBe(2);
		expect(body).not.toMatch(/type="text"/);
		expect(body).toContain('Password requirements');
	});

	it('offers no form for a link it already knows is missing', () => {
		const flowStore = createStore({
			initialState: createInitialResetPasswordState(null),
			reducer: resetPasswordReducer,
			dependencies: { resetPassword: async () => null }
		});
		const body = render(ResetPasswordForm, {
			props: { flowStore, sessionStore: inertSession(), onRequestNewLink: () => {} }
		}).body;

		expect(body).toContain('This link is incomplete');
		expect(body, 'a form was rendered with no token to submit against').not.toContain(
			'type="password"'
		);
	});
});

describe('the server build of the MFA pair', () => {
	const inertSession = () =>
		createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: {
				fetchLogin: async () => session,
				fetchLogout: async () => undefined,
				fetchSession: async () => null
			}
		});

	it('renders one code field, ready for the OS to autofill', () => {
		const flowStore = createStore({
			initialState: createInitialMfaChallengeState('chal_1', ['totp', 'recovery_code']),
			reducer: mfaChallengeReducer,
			dependencies: { verifyMfaChallenge: async () => session }
		});
		const body = render(MfaChallengeForm, {
			props: { flowStore, sessionStore: inertSession(), onStartOver: () => {} }
		}).body;

		expect((body.match(/<input/g) ?? []).length, 'split boxes crept back in').toBe(1);
		expect(body).toContain('autocomplete="one-time-code"');
		expect(body).toContain('inputmode="numeric"');
		expect(body).toContain('Use a recovery code instead');
	});

	it('does not begin an enrolment while rendering', () => {
		// Effects do not run on the server, which is what this depends on: a render
		// that started an enrolment would issue a secret nobody asked for, and a
		// cached render would issue one per request.
		const flowStore = createStore({
			initialState: createInitialMfaEnrolmentState(),
			reducer: mfaEnrolmentReducer,
			dependencies: {
				beginMfaEnrolment: async () => {
					throw new Error('the server must not begin an enrolment');
				},
				confirmMfaEnrolment: async () => ({ recoveryCodes: ['a'] })
			}
		});
		const body = render(MfaEnrolment, { props: { flowStore } }).body;

		expect(body).toContain('Preparing your setup key');
		expect(body).not.toContain('<input');
	});

	it('renders the recovery codes from state alone', () => {
		const flowStore = createStore({
			initialState: {
				...createInitialMfaEnrolmentState(),
				status: 'enrolled' as const,
				recoveryCodes: ['aaa-111', 'bbb-222']
			},
			reducer: mfaEnrolmentReducer,
			dependencies: {
				beginMfaEnrolment: async () => ({ enrolmentId: 'e', secret: 's', otpauthUri: 'o' }),
				confirmMfaEnrolment: async () => ({ recoveryCodes: ['a'] })
			}
		});
		const body = render(MfaEnrolment, { props: { flowStore } }).body;

		expect(body).toContain('Save your recovery codes');
		expect(body).toContain('aaa-111');
		expect(body).toContain('shown <strong>once</strong>');
	});
});

// ============================================================
// OAuth
// ============================================================

describe('OAuth on the server', () => {
	const refuse = (what: string) => () => {
		throw new Error(`the server must not ${what}`);
	};

	// Only `dispatch` is read, and nothing on the server dispatches — the prop is
	// narrow on purpose, so this is the whole of what it needs.
	const noSession = { dispatch: () => {} };

	it('renders the providers without starting anything', () => {
		const flowStore = createStore({
			initialState: createInitialOAuthStartState(),
			reducer: oauthStartReducer,
			dependencies: {
				beginOAuth: refuse('begin an OAuth sign-in'),
				pendingOAuth: { put: refuse('store a pending record'), take: () => null },
				redirect: refuse('navigate')
			}
		});
		const body = render(OAuthSignIn, {
			props: {
				flowStore,
				providers: [
					{ id: 'google', label: 'Google' },
					{ id: 'github', label: 'GitHub' }
				]
			}
		}).body;

		expect(body).toContain('Continue with Google');
		expect(body).toContain('Continue with GitHub');
		// Controls, never links — a ctrl-click would open the authorize page in a
		// tab whose sessionStorage is a copy, and the record would land in the
		// wrong one.
		expect(body).toContain('type="button"');
		expect(body).not.toContain('<a ');
	});

	it('does not exchange a code while rendering', () => {
		// The redirect and the exchange are both effects, and effects do not run on
		// the server. If either did, a server render would spend a single-use code
		// and a cached render would spend one per request.
		const flowStore = createStore({
			initialState: createInitialOAuthCallbackState(),
			reducer: oauthCallbackReducer,
			dependencies: {
				completeOAuth: refuse('exchange an authorization code'),
				pendingOAuth: { put: refuse('store a pending record'), take: () => null }
			}
		});
		const body = render(OAuthCallback, {
			props: {
				flowStore,
				sessionStore: noSession,
				params: { code: 'c_1', state: 'st_1', error: null, errorDescription: null },
				onSuccess: () => {},
				onStartOver: () => {}
			}
		}).body;

		expect(body).toContain('Finishing your sign-in');
	});

	it('renders an unverifiable callback, and its way out, from state alone', () => {
		const flowStore = createStore({
			initialState: {
				...createInitialOAuthCallbackState(),
				status: 'failed' as const,
				error: {
					code: 'oauth_state_mismatch' as const,
					message: 'That sign-in link has already been used, or is no longer valid.'
				}
			},
			reducer: oauthCallbackReducer,
			dependencies: {
				completeOAuth: refuse('exchange an authorization code'),
				pendingOAuth: { put: refuse('store a pending record'), take: () => null }
			}
		});
		const body = render(OAuthCallback, {
			props: {
				flowStore,
				sessionStore: noSession,
				params: { code: 'c_1', state: 'st_1', error: null, errorDescription: null },
				onSuccess: () => {},
				onStartOver: () => {},
				headingLevel: 1
			}
		}).body;

		expect(body).toContain('<h1');
		expect(body).toContain('Start again');
		expect(body).toContain('data-error-code="oauth_state_mismatch"');
	});

	it('constructs its browser dependencies without a browser', () => {
		// `createSessionStorage` throws on a server, and this package's own README
		// calls dependency factories at module scope. Both of these must therefore
		// be constructible here — the failure has to wait until they are used.
		const storage = createPendingOAuthStorage();
		expect(storage.take()).toBeNull();
		expect(() => storage.put({ provider: 'github', state: 'st_1', returnTo: null })).toThrow();

		expect(() => createBrowserRedirect()).not.toThrow();
	});
});
