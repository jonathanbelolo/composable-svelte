/**
 * `SignupForm` and `PasswordCriteria` — browser mode.
 *
 * Three things are proved here that the reducer tests cannot.
 *
 * The **two endings**: a backend that issues a session hands it over, and one
 * that does not renders a terminal panel and dispatches nothing. Getting the
 * second wrong signs in an account that cannot be used yet.
 *
 * The **live mismatch**. Until `870c0ca`, core's per-field validation parsed one
 * sub-schema in isolation, so a `.refine()` spanning two fields was invisible
 * outside `onSubmit`. This form is `mode: 'onBlur'`, so the assertion below —
 * mismatch on blur, cleared by fixing the *other* field — is the consumer-level
 * proof of that fix.
 *
 * And the **checklist**, which must never disagree with the schema.
 */

import { describe, it, expect, vi } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import SignupForm from '../src/lib/components/SignupForm.svelte';
import PasswordCriteria from '../src/lib/components/PasswordCriteria.svelte';
import { createInitialSignupState, signupReducer } from '../src/lib/flows/signup/reducer.js';
import { PASSWORD_MIN_LENGTH } from '../src/lib/flows/signup/schema.js';
import type { SignupDependencies } from '../src/lib/flows/signup/types.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: '7d3f0000-0000-4000-8000-000000000007',
	display_name: 'Grace Hopper',
	roles: ['member']
};

const GOOD = 'correct-horse-battery';

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

function mountForm(deps: SignupDependencies, props: Record<string, unknown> = {}) {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialSignupState(),
		reducer: signupReducer,
		dependencies: deps
	});
	const realSession = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertSessionDeps
	});
	const sessionActions: Array<{ type: string }> = [];
	const sessionStore = {
		dispatch(action: Parameters<typeof realSession.dispatch>[0]) {
			sessionActions.push(action);
			realSession.dispatch(action);
		}
	};

	const component = mount(SignupForm, {
		target,
		props: { flowStore, sessionStore, ...props } as never
	});

	const inputs = () => [...target.querySelectorAll('input')] as HTMLInputElement[];
	return {
		target,
		component,
		flowStore,
		sessionActions,
		email: () => target.querySelector('input[type="email"]') as HTMLInputElement,
		password: () => inputs().find((i) => i.name === 'new-password')!,
		confirm: () => inputs().find((i) => i.name === 'confirm-password')!,
		submit: () => target.querySelector('button[type="submit"]') as HTMLButtonElement,
		banner: () => target.querySelector('[data-error-code]'),
		described: (field: HTMLInputElement) => {
			const id = field.getAttribute('aria-describedby');
			return id ? target.querySelector(`#${CSS.escape(id)}`) : null;
		},
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

type Harness = ReturnType<typeof mountForm>;

async function type(field: HTMLInputElement, value: string) {
	await userEvent.fill(field, value);
	flushSync();
}

async function fill(h: Harness, email = 'grace@example.com', password = GOOD, confirm = password) {
	await type(h.email(), email);
	await type(h.password(), password);
	await type(h.confirm(), confirm);
}

describe('the two endings', () => {
	it('hands the session over when the backend issues one', async () => {
		const onSuccess = vi.fn();
		const h = mountForm(
			{ signup: vi.fn(async () => ({ kind: 'session' as const, session })) },
			{ onSuccess }
		);

		try {
			await fill(h);
			await userEvent.click(h.submit());
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});
			expect(onSuccess).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('shows the terminal panel and establishes nothing when it does not', async () => {
		// The branch that matters. There is no session, so dispatching
		// `sessionEstablished` would sign in an account that cannot be used.
		const onVerificationRequired = vi.fn();
		const h = mountForm(
			{
				signup: vi.fn(async () => ({
					kind: 'verificationRequired' as const,
					email: 'grace@example.com'
				}))
			},
			{ onVerificationRequired }
		);

		try {
			await fill(h);
			await userEvent.click(h.submit());

			await vi.waitFor(() => {
				flushSync();
				expect(h.target.textContent).toContain('Check your email');
			});

			expect(h.sessionActions, 'a session was established without one existing').toEqual([]);
			expect(onVerificationRequired).toHaveBeenCalledWith('grace@example.com');
			expect(h.target.querySelector('form'), 'the form is still up behind the panel').toBeNull();

			const panel = h.target.querySelector('[role="status"]')!;
			expect(panel.getAttribute('aria-live')).toBe('polite');
			expect(panel.textContent, 'the address is not named back to the user').toContain(
				'grace@example.com'
			);
		} finally {
			h.cleanup();
		}
	});

	it('lets a consumer replace the panel entirely', async () => {
		// The `verification` snippet receives the address, so a consumer can put
		// a resend button or a route change there instead of prose.
		const h = mountForm(
			{
				signup: vi.fn(async () => ({ kind: 'verificationRequired' as const, email: 'g@example.com' }))
			},
			{
				verification: createRawSnippet<[{ email: string }]>((getArgs) => ({
					render: () => `<p data-testid="custom">Mail is on its way to ${getArgs().email}</p>`
				}))
			}
		);

		try {
			await fill(h, 'g@example.com');
			await userEvent.click(h.submit());
			await vi.waitFor(() => {
				flushSync();
				expect(h.target.querySelector('[data-testid="custom"]')).not.toBeNull();
			});

			expect(h.target.querySelector('[data-testid="custom"]')!.textContent).toContain(
				'g@example.com'
			);
			expect(h.target.textContent, 'the default panel rendered as well').not.toContain(
				'Check your email'
			);
		} finally {
			h.cleanup();
		}
	});
});

describe('the live mismatch', () => {
	it('reports it on blur, not only on submit', async () => {
		// Consumer-level proof of the core fix. Before it, per-field validation
		// parsed `schema.shape.confirmPassword` alone — which any string passes —
		// so this assertion could only have been made after a submit.
		const h = mountForm({ signup: vi.fn() as unknown as SignupDependencies['signup'] });

		try {
			await type(h.password(), GOOD);
			await type(h.confirm(), 'something-else-entirely');
			h.confirm().blur();

			await vi.waitFor(() => {
				flushSync();
				expect(h.confirm().getAttribute('aria-invalid')).toBe('true');
			});

			const message = h.described(h.confirm());
			expect(message?.textContent?.trim()).toBe('Passwords do not match');
			expect(message?.getAttribute('role')).toBe('alert');
		} finally {
			h.cleanup();
		}
	});

	it('clears it when the user fixes the other field', async () => {
		// The stale-error half. The message was about a state that no longer
		// existed, and it used to sit there until the confirm field was touched.
		const h = mountForm({ signup: vi.fn() as unknown as SignupDependencies['signup'] });

		try {
			await type(h.password(), GOOD);
			await type(h.confirm(), 'something-else-entirely');
			h.confirm().blur();
			await vi.waitFor(() => {
				flushSync();
				expect(h.confirm().getAttribute('aria-invalid')).toBe('true');
			});

			// Fix it by editing PASSWORD, never touching confirm again.
			await type(h.password(), 'something-else-entirely');
			h.password().blur();

			await vi.waitFor(() => {
				flushSync();
				expect(
					h.confirm().hasAttribute('aria-invalid'),
					'a stale, now-false mismatch survived'
				).toBe(false);
			});
		} finally {
			h.cleanup();
		}
	});
});

describe('when the address is already registered', () => {
	it('offers to sign in rather than only apologising', async () => {
		// Why `email_taken` is its own arm: the useful response is an offer, and
		// a surface cannot derive one from prose.
		const failure: AuthError = {
			code: 'email_taken',
			message: 'An account already exists for that address.',
			email: 'grace@example.com'
		};
		const onSignIn = vi.fn();
		const h = mountForm(
			{
				signup: vi.fn(async () => {
					throw failure;
				})
			},
			{ onSignIn }
		);

		try {
			expect(h.banner(), 'a banner before anything failed').toBeNull();

			await fill(h);
			await userEvent.click(h.submit());
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});

			const banner = h.banner()!;
			expect(banner.getAttribute('data-error-code')).toBe('email_taken');
			expect(banner.getAttribute('role')).toBe('alert');

			const action = banner.querySelector('button')!;
			expect(action, 'no way to act on the failure').not.toBeNull();
			await userEvent.click(action);
			expect(onSignIn).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('offers nothing when the consumer gave it nowhere to go', async () => {
		// Non-vacuity: the button is conditional on `onSignIn`, so a form without
		// a sign-in route must not render a control that does nothing.
		const h = mountForm({
			signup: vi.fn(async () => {
				throw { code: 'email_taken', message: 'Taken.' } satisfies AuthError;
			})
		});

		try {
			await fill(h);
			await userEvent.click(h.submit());
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});

			expect(h.banner()!.querySelector('button')).toBeNull();
		} finally {
			h.cleanup();
		}
	});
});

describe('PasswordCriteria', () => {
	function mountCriteria(password: string) {
		const target = mountTarget();
		const component = mount(PasswordCriteria, { target, props: { password, id: 'crit' } });
		return { target, component, items: () => [...target.querySelectorAll('li')] };
	}

	it('marks each requirement as the password reaches it', () => {
		const short = mountCriteria('short');
		try {
			expect(short.items().length).toBeGreaterThan(0);
			expect(short.items()[0]!.dataset.met, 'a 5-character password met the length rule').toBe(
				'false'
			);
		} finally {
			unmount(short.component);
			short.target.remove();
		}

		const good = mountCriteria('a'.repeat(PASSWORD_MIN_LENGTH));
		try {
			expect(good.items().every((li) => li.dataset.met === 'true')).toBe(true);
		} finally {
			unmount(good.component);
			good.target.remove();
		}
	});

	it('states each verdict in text, not only in colour', () => {
		// The mark is `aria-hidden`; without the text a screen reader user gets a
		// list of requirements with no indication of which are satisfied.
		const { target, component, items } = mountCriteria('short');
		try {
			expect(items()[0]!.textContent).toContain('Not met');
			expect(items()[1]!.textContent).toContain('Met');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('is not a live region', () => {
		// Announcing on every keystroke is one interruption per character. The
		// field points at this through `aria-describedby` instead.
		const { target, component } = mountCriteria('short');
		try {
			expect(target.querySelector('[aria-live]')).toBeNull();
			expect(target.querySelector('ul')!.getAttribute('aria-label')).toBe(
				'Password requirements'
			);
		} finally {
			unmount(component);
			target.remove();
		}
	});
});

describe('Pattern A: the form animates nothing', () => {
	it('resolves no transition or animation on its controls', async () => {
		const h = mountForm({ signup: vi.fn() as unknown as SignupDependencies['signup'] });
		try {
			for (const element of [h.email(), h.password(), h.confirm(), h.submit()]) {
				const computed = getComputedStyle(element);
				expect(computed.transitionDuration).toBe('0s');
				expect(computed.animationName).toBe('none');
			}
		} finally {
			h.cleanup();
		}
	});
});
