/**
 * `LoginForm` — browser mode.
 *
 * Two things are being proved here that the reducer tests cannot.
 *
 * The first is the handoff. The flow store ends a successful sign-in holding a
 * `SessionSnapshot`; the session store is what the rest of the app reads. This
 * component is the only thing that carries it across, and if it fires twice the
 * session re-enters `authenticated` on every subsequent dispatch — the same
 * hazard `auth-guard-anonymous.test.ts` exists for, from the other direction.
 *
 * The second is the accessibility wiring. `FormItem`, `FormLabel` and
 * `FormMessage` are Tailwind and cannot be used from a satellite package, so
 * the contract they implement is hand-written here — which means nothing but
 * these assertions holds it up.
 */

import { describe, it, expect, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { userEvent } from 'vitest/browser';
import { createStore } from '@composable-svelte/core';

import LoginForm from '../src/lib/components/LoginForm.svelte';
import LoginFormStoreSwap from './test-components/LoginFormStoreSwap.svelte';
import { createInitialLoginState, loginReducer } from '../src/lib/flows/login/reducer.js';
import type { LoginDependencies, LoginState } from '../src/lib/flows/login/types.js';
import { createInitialSessionState, sessionReducer } from '../src/lib/session/reducer.js';
import type { SessionDependencies } from '../src/lib/session/types.js';
import type { AuthError } from '../src/lib/errors/types.js';
import type { SessionSnapshot } from '../src/lib/subject/types.js';

const session: SessionSnapshot = {
	subject_id: '9c1e0000-0000-4000-8000-000000000042',
	display_name: 'Ada Lovelace',
	roles: ['member']
};

const inertSessionDeps: SessionDependencies = {
	fetchLogin: async () => session,
	fetchLogout: async () => undefined,
	fetchSession: async () => null
};

/** Hold a sign-in in flight, so the pending UI can be observed rather than raced. */
function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, resolve, reject };
}

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

interface Harness {
	target: HTMLDivElement;
	component: Record<string, unknown>;
	flowStore: { readonly state: LoginState };
	/** Every action the session store was handed, in order. */
	sessionActions: Array<{ type: string }>;
	onSuccess: ReturnType<typeof vi.fn>;
	email: HTMLInputElement;
	password: HTMLInputElement;
	remember: HTMLInputElement;
	submit: HTMLButtonElement;
	/** The form-level failure banner, or null when there is none. */
	banner: () => HTMLElement | null;
	/** The message linked to a field by `aria-describedby`, or null. */
	described: (field: HTMLInputElement) => HTMLElement | null;
	cleanup: () => void;
}

function mountForm(deps: LoginDependencies): Harness {
	const target = mountTarget();
	const flowStore = createStore({
		initialState: createInitialLoginState(),
		reducer: loginReducer,
		dependencies: deps
	});
	const realSessionStore = createStore({
		initialState: createInitialSessionState(),
		reducer: sessionReducer,
		dependencies: inertSessionDeps
	});

	// A spy in front of the real store, so the arrival can be counted *and* the
	// resulting session state is a genuine reducer output rather than an
	// assumption about one.
	const sessionActions: Array<{ type: string }> = [];
	const sessionStore = {
		dispatch(action: Parameters<typeof realSessionStore.dispatch>[0]) {
			sessionActions.push(action);
			realSessionStore.dispatch(action);
		}
	};

	const onSuccess = vi.fn();
	const component = mount(LoginForm, {
		target,
		props: { flowStore, sessionStore, onSuccess }
	});

	const byType = (selector: string) => target.querySelector(selector) as HTMLInputElement;

	return {
		target,
		component,
		flowStore,
		sessionActions,
		onSuccess,
		email: byType('input[type="email"]'),
		password: byType('input[type="password"], input[type="text"]'),
		remember: byType('input[type="checkbox"]'),
		submit: target.querySelector('button[type="submit"]') as HTMLButtonElement,
		banner: () => target.querySelector('[data-error-code]'),
		described: (field) => {
			const id = field.getAttribute('aria-describedby');
			return id ? target.querySelector(`#${CSS.escape(id)}`) : null;
		},
		cleanup: () => {
			unmount(component);
			target.remove();
		}
	};
}

/** Type into a field the way a user does, so the reducer sees each keystroke. */
async function type(field: HTMLInputElement, value: string) {
	await userEvent.fill(field, value);
	flushSync();
}

/** Fill both fields and submit. */
async function signIn(h: Harness, email = 'ada@example.com', password = 'hunter2') {
	await type(h.email, email);
	await type(h.password, password);
	await userEvent.click(h.submit);
	flushSync();
}

describe('the fields', () => {
	it('links every label to its own control', () => {
		// A `<label>` whose `for` matches nothing is invisible to a screen reader
		// and does not focus its field on click. Three labels, three ids, checked
		// against the elements actually in the document.
		const h = mountForm({ login: vi.fn(async () => session) });

		try {
			const labels = [...h.target.querySelectorAll('label')];
			expect(labels.length).toBe(3);

			for (const label of labels) {
				const id = label.getAttribute('for');
				expect(id, 'a label points at nothing').toBeTruthy();
				const control = h.target.querySelector(`#${CSS.escape(id!)}`);
				expect(control, `no control with id ${id}`).not.toBeNull();
				expect(control!.tagName).toBe('INPUT');
			}

			expect(new Set(labels.map((l) => l.getAttribute('for'))).size, 'two labels share a for').toBe(
				3
			);
		} finally {
			h.cleanup();
		}
	});

	it('gives two instances on one page different ids', () => {
		// A signup panel beside a sign-in panel is the ordinary case, and hardcoded
		// ids make `aria-describedby` resolve to whichever came first — silently,
		// and only for the second form.
		const first = mountForm({ login: vi.fn(async () => session) });
		const second = mountForm({ login: vi.fn(async () => session) });

		try {
			expect(first.email.id).not.toBe(second.email.id);
			expect(first.password.id).not.toBe(second.password.id);
			expect(first.remember.id).not.toBe(second.remember.id);
		} finally {
			first.cleanup();
			second.cleanup();
		}
	});

	it('offers the autocomplete a password manager looks for', () => {
		const h = mountForm({ login: vi.fn(async () => session) });

		try {
			expect(h.email.getAttribute('autocomplete')).toBe('username');
			expect(h.password.getAttribute('autocomplete')).toBe('current-password');
		} finally {
			h.cleanup();
		}
	});

	it('reports each keystroke into the flow store', async () => {
		// Not just on blur. `FormControl` wires `onchange`, which is why this
		// component hand-wires `oninput` instead.
		const h = mountForm({ login: vi.fn(async () => session) });

		try {
			await type(h.email, 'ada@example.com');
			expect(h.flowStore.state.form.data.email).toBe('ada@example.com');

			await userEvent.click(h.remember);
			flushSync();
			expect(h.flowStore.state.form.data.rememberMe, 'the checkbox did not land').toBe(true);
		} finally {
			h.cleanup();
		}
	});
});

describe('when the flow store is replaced', () => {
	it('follows the new store instead of quietly detaching from it', () => {
		// `Form` captures its store into context at init and `FormField` reads
		// `$store.data[name]`, so both hold whatever object this component handed
		// them on its first render. Delegating `subscribe` straight through pinned
		// the subscription to the *first* store: the field went on showing the old
		// data while dispatches went to the new one, and typing left the input
		// uncontrolled — DOM holding one value, store another, nothing thrown.
		// Recreating the store to reset a form is how a consumer meets that.
		const target = mountTarget();
		const flow = (email: string) =>
			createStore({
				initialState: createInitialLoginState({ email }),
				reducer: loginReducer,
				dependencies: { login: vi.fn(async () => session) }
			});
		const a = flow('first@example.com');
		const b = flow('second@example.com');
		const sessionStore = createStore({
			initialState: createInitialSessionState(),
			reducer: sessionReducer,
			dependencies: inertSessionDeps
		});
		const probe = mount(LoginFormStoreSwap, {
			target,
			props: { a, b, sessionStore }
		}) as unknown as { swap: () => void };

		try {
			const field = () => target.querySelector('input[type="email"]') as HTMLInputElement;
			expect(field().value).toBe('first@example.com');

			probe.swap();
			flushSync();
			expect(field().value, 'the field stayed on the old store').toBe('second@example.com');

			// …and the two halves still agree: what is displayed is what receives.
			field().value = 'typed@example.com';
			field().dispatchEvent(new Event('input', { bubbles: true }));
			flushSync();
			expect(b.state.form.data.email).toBe('typed@example.com');
			expect(a.state.form.data.email, 'the old store was written to').toBe('first@example.com');
			expect(field().value, 'the input stopped being controlled').toBe('typed@example.com');
		} finally {
			unmount(probe as never);
			target.remove();
		}
	});
});

describe('when the fields are invalid', () => {
	it('links the message to the field, and does not before', async () => {
		const login = vi.fn(async () => session);
		const h = mountForm({ login });

		try {
			// Non-vacuity: `mode: 'onSubmit'`, so nothing is flagged while typing.
			await type(h.email, 'not-an-email');
			expect(h.email.hasAttribute('aria-invalid'), 'flagged before submitting').toBe(false);
			expect(h.described(h.email)).toBeNull();

			await userEvent.click(h.submit);
			await vi.waitFor(() => {
				flushSync();
				expect(h.email.getAttribute('aria-invalid')).toBe('true');
			});

			const message = h.described(h.email);
			expect(message, '`aria-describedby` points at no element').not.toBeNull();
			expect(message!.getAttribute('role'), 'the message is not announced').toBe('alert');
			expect(message!.getAttribute('aria-live')).toBe('polite');
			expect(message!.textContent?.trim()).toBe('Enter a valid email address');

			expect(login, 'an invalid form reached the network').not.toHaveBeenCalled();
		} finally {
			h.cleanup();
		}
	});
});

describe('a successful sign-in', () => {
	it('hands the session across exactly once', async () => {
		const h = mountForm({ login: vi.fn(async () => session) });

		try {
			await signIn(h);

			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.map((a) => a.type)).toEqual(['sessionEstablished']);
			});
			expect(h.onSuccess).toHaveBeenCalledTimes(1);

			// Every later dispatch re-runs the effect's dependencies. Without the
			// guard, each one re-establishes the session.
			await type(h.email, 'someone.else@example.com');
			await type(h.password, 'another');
			flushSync();

			expect(h.sessionActions.length, 'the handoff fired again').toBe(1);
			expect(h.onSuccess).toHaveBeenCalledTimes(1);
		} finally {
			h.cleanup();
		}
	});

	it('hands it across again for a second sign-in on the same mounted form', async () => {
		// "Once per sign-in", not "once per lifetime". A form that survives a
		// sign-out — a modal the app keeps alive, a login route it returns to —
		// would otherwise establish the first session and drop every one after it,
		// with no error anywhere. The mock returns the *same* snapshot object each
		// time, which is why the guard cannot key on the snapshot's identity.
		const h = mountForm({ login: vi.fn(async () => session) });

		try {
			await signIn(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.length).toBe(1);
			});

			await signIn(h, 'ada@example.com', 'hunter2');
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.length, 'the second sign-in was swallowed').toBe(2);
			});
			expect(h.onSuccess).toHaveBeenCalledTimes(2);
		} finally {
			h.cleanup();
		}
	});

	it('sends what was typed, remember-me included', async () => {
		const login: LoginDependencies['login'] = vi.fn(async () => session);
		const h = mountForm({ login });

		try {
			await userEvent.click(h.remember);
			flushSync();
			await signIn(h, 'ada@example.com', 'hunter2');

			await vi.waitFor(() => {
				expect(login).toHaveBeenCalledWith(
					{ email: 'ada@example.com', password: 'hunter2', rememberMe: true },
					expect.anything()
				);
			});
		} finally {
			h.cleanup();
		}
	});
});

describe('while the sign-in is in flight', () => {
	it('disables the submit button rather than only relabelling it', async () => {
		// Core's form reducer has no re-entrancy guard, so a second click here is a
		// second authentication attempt. Two of the three form examples in the repo
		// swap the label and leave the button live; this asserts the property that
		// actually prevents the double submit.
		const gate = deferred<SessionSnapshot>();
		const login: LoginDependencies['login'] = vi.fn(async () => gate.promise);
		const h = mountForm({ login });

		try {
			expect(h.submit.disabled, 'disabled before anything happened').toBe(false);

			await signIn(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.submit.disabled).toBe(true);
			});
			expect(h.submit.textContent?.trim()).toBe('Signing in…');

			// The fields deliberately stay live. Disabling them buys nothing — the
			// credentials were captured at dispatch — and submitting with Enter
			// leaves focus in the password field, where disabling drops focus to
			// `<body>`.
			expect(h.email.disabled, 'the fields were disabled too').toBe(false);
			expect(h.password.disabled).toBe(false);

			// …so Enter must not get around the disabled button. The HTML spec
			// skips implicit submission when the default button is disabled; this
			// asserts the browser actually does, rather than assuming it.
			h.email.focus();
			await userEvent.keyboard('{Enter}');
			flushSync();
			expect(login, 'Enter submitted around the disabled button').toHaveBeenCalledTimes(1);

			// A native `.click()`, not `userEvent.click()`: the latter waits for the
			// element to become enabled and times out after thirty seconds, which
			// reports a passing property as a failure. The browser suppresses a
			// click on a disabled control, and that suppression is the assertion —
			// it is what an impatient second click actually does.
			h.submit.click();
			flushSync();
			expect(login, 'a disabled button was still submittable').toHaveBeenCalledTimes(1);

			gate.resolve(session);
			await vi.waitFor(() => {
				flushSync();
				expect(h.sessionActions.length).toBe(1);
			});
		} finally {
			h.cleanup();
		}
	});
});

describe('when the sign-in fails', () => {
	it('shows the message and exposes the code it came from', async () => {
		// `data-error-code` is the whole reason `AuthError` is a union rather than
		// a string: a surface branches on it, and so can a test.
		const failure: AuthError = {
			code: 'account_locked',
			message: 'Too many attempts. Try again in an hour.',
			until: '2026-08-31T16:00:00.000Z'
		};
		const h = mountForm({
			login: vi.fn(async () => {
				throw failure;
			})
		});

		try {
			expect(h.banner(), 'a banner before anything failed').toBeNull();

			await signIn(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});

			const banner = h.banner()!;
			expect(banner.getAttribute('data-error-code')).toBe('account_locked');
			expect(banner.getAttribute('role')).toBe('alert');
			expect(banner.getAttribute('aria-live')).toBe('polite');
			expect(banner.textContent?.trim()).toBe('Too many attempts. Try again in an hour.');

			// The form is usable again — `loginFailed` returns to `idle`, not to a
			// second failed status.
			expect(h.submit.disabled).toBe(false);
			expect(h.sessionActions, 'a failed sign-in established a session').toEqual([]);
		} finally {
			h.cleanup();
		}
	});

	it('clears the banner as soon as the user starts correcting', async () => {
		// Core never clears its own `submitError` on `fieldChanged`. Without the
		// flow's clause the banner complains about the password being retyped.
		const h = mountForm({
			login: vi.fn(async () => {
				throw { code: 'invalid_credentials', message: 'Wrong password.' } satisfies AuthError;
			})
		});

		try {
			await signIn(h);
			await vi.waitFor(() => {
				flushSync();
				expect(h.banner()).not.toBeNull();
			});

			await type(h.password, 'hunter3');
			flushSync();
			expect(h.banner(), 'a stale failure survived the correction').toBeNull();
		} finally {
			h.cleanup();
		}
	});
});

describe('what it announces', () => {
	it('defaults to a heading that can be embedded', () => {
		// `<h1>` inside a page that already has one — the styleguide demo, a modal,
		// a sign-in panel beside a sign-up panel — is a document-structure defect
		// that renders identically to a correct one. A dedicated /login page opts
		// back in with `headingLevel={1}`.
		const h = mountForm({ login: vi.fn(async () => session) });
		try {
			expect(h.target.querySelector('h1')).toBeNull();
			expect(h.target.querySelector('h2')?.textContent?.trim()).toBe('Sign in');
		} finally {
			h.cleanup();
		}
	});

	it('says it is working, since a disabled button cannot', async () => {
		// Assistive technology skips a disabled control, so the button's label
		// change from "Sign in" to "Signing in…" is announced to nobody. Without a
		// live region, submitting produces silence until the result lands.
		const gate = deferred<SessionSnapshot>();
		const h = mountForm({ login: vi.fn(async () => gate.promise) });
		const status = () => h.target.querySelector('[role="status"]');

		try {
			expect(status(), 'no live region at all').not.toBeNull();
			expect(status()!.getAttribute('aria-live')).toBe('polite');
			expect(status()!.textContent?.trim(), 'announcing before anything happened').toBe('');

			await signIn(h);
			await vi.waitFor(() => {
				flushSync();
				expect(status()!.textContent?.trim()).toBe('Signing in…');
			});

			gate.resolve(session);
			await vi.waitFor(() => {
				flushSync();
				expect(status()!.textContent?.trim(), 'still announcing after it finished').toBe('');
			});
		} finally {
			h.cleanup();
		}
	});

	it('gives the controls names a password manager can key on', () => {
		// `autocomplete` is the primary signal, but manager heuristics fall back to
		// `name` — and `id` here is per-instance `$props.id()` output, which means
		// nothing to them.
		const h = mountForm({ login: vi.fn(async () => session) });
		try {
			expect(h.email.name).toBe('email');
			expect(h.password.name).toBe('password');
			expect(h.remember.name).toBe('rememberMe');
		} finally {
			h.cleanup();
		}
	});
});

describe('Pattern A: the form animates nothing', () => {
	it('resolves no transition or animation on the controls', () => {
		const h = mountForm({ login: vi.fn(async () => session) });

		try {
			for (const element of [h.email, h.password, h.remember, h.submit]) {
				const computed = getComputedStyle(element);
				expect(computed.transitionDuration).toBe('0s');
				expect(computed.animationName).toBe('none');
			}
		} finally {
			h.cleanup();
		}
	});
});
