/**
 * `PasswordInput` — browser mode.
 *
 * The assertions that matter are the accessibility ones. A show/hide toggle
 * that is a `<div onclick>`, or one that is `tabindex="-1"` like `Combobox`'s
 * chevron, removes the only way to reveal a password without a pointer — and
 * both mistakes render identically. Each is pinned here, with a non-vacuity arm
 * so a selector that stopped matching cannot pass as a fixed bug.
 */

import { describe, it, expect, vi } from 'vitest';
import { flushSync, mount, unmount, type ComponentProps } from 'svelte';
import { userEvent } from 'vitest/browser';

import PasswordInput from '../src/lib/components/PasswordInput.svelte';

type PasswordInputProps = ComponentProps<typeof PasswordInput>;

function mountTarget(): HTMLDivElement {
	const target = document.createElement('div');
	document.body.appendChild(target);
	return target;
}

/**
 * Mount with the required props filled in, so each test states only its own.
 *
 * Typed through `ComponentProps` rather than cast: a cast here would mean a
 * prop this file passes could stop existing and every test would still compile,
 * which is the failure `svelte-check` is run to prevent.
 */
function mountInput(props: Partial<PasswordInputProps> = {}) {
	const target = mountTarget();
	const component = mount(PasswordInput, {
		target,
		props: { id: 'pw', value: '', oninput: () => {}, ...props }
	});
	const field = target.querySelector('input') as HTMLInputElement;
	const toggle = target.querySelector('button') as HTMLButtonElement;
	return { target, component, field, toggle };
}

describe('the show/hide toggle', () => {
	it('starts hidden and reveals on click', async () => {
		const { target, component, field, toggle } = mountInput();

		try {
			expect(field.type).toBe('password');
			expect(toggle.getAttribute('aria-pressed')).toBe('false');

			await userEvent.click(toggle);
			flushSync();

			expect(field.type).toBe('text');
			expect(toggle.getAttribute('aria-pressed')).toBe('true');

			await userEvent.click(toggle);
			flushSync();

			expect(field.type, 'the toggle did not toggle back').toBe('password');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('names itself for what the next click will do', async () => {
		// Not "Password visibility" — a label that does not change tells a screen
		// reader user nothing about the state they are in.
		const { target, component, toggle } = mountInput();

		try {
			expect(toggle.getAttribute('aria-label')).toBe('Show password');
			await userEvent.click(toggle);
			flushSync();
			expect(toggle.getAttribute('aria-label')).toBe('Hide password');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('takes its labels from props, for a localised surface', async () => {
		const { target, component, toggle } = mountInput({
			showLabel: 'Afficher le mot de passe',
			hideLabel: 'Masquer le mot de passe'
		});

		try {
			expect(toggle.getAttribute('aria-label')).toBe('Afficher le mot de passe');
			await userEvent.click(toggle);
			flushSync();
			expect(toggle.getAttribute('aria-label')).toBe('Masquer le mot de passe');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('is reachable by keyboard from the field it controls', async () => {
		// The reason this component does not reuse `Combobox`'s `tabindex="-1"`
		// chevron: that one duplicates keyboard access the input already offers,
		// and this one has no keyboard equivalent at all. Take it out of the tab
		// order and the affordance is pointer-only.
		const { target, component, field, toggle } = mountInput();

		try {
			expect(toggle.tagName, 'a div with onclick is not focusable').toBe('BUTTON');
			expect(toggle.getAttribute('type'), 'a bare button inside a form submits it').toBe('button');
			expect(toggle.hasAttribute('tabindex')).toBe(false);

			field.focus();
			expect(document.activeElement).toBe(field);

			await userEvent.keyboard('{Tab}');
			expect(document.activeElement, 'the toggle is not in the tab order').toBe(toggle);

			// …and it responds to the keyboard once focused.
			await userEvent.keyboard(' ');
			flushSync();
			expect(field.type).toBe('text');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('points at the field it controls', () => {
		const { target, component, field, toggle } = mountInput({ id: 'signin-password' });

		try {
			expect(field.id).toBe('signin-password');
			expect(toggle.getAttribute('aria-controls')).toBe('signin-password');
		} finally {
			unmount(component);
			target.remove();
		}
	});
});

describe('the field', () => {
	it('reports every keystroke, not just blur', async () => {
		// `oninput`, not `onchange` — which is why `FormControl` is not used
		// anywhere in this repo. With `onchange` a strength meter, a live
		// validator and a disabled-until-filled button all update only on blur.
		// Read inside the handler, not from the retained mock call: `currentTarget`
		// is only meaningful during dispatch and the browser nulls it afterwards,
		// so asserting on a stored event reads null and says nothing.
		const seen: string[] = [];
		const oninput = vi.fn((event: Event & { currentTarget: HTMLInputElement }) => {
			seen.push(event.currentTarget.value);
		});
		const { target, component, field } = mountInput({ oninput });

		try {
			await userEvent.fill(field, 'abc');
			expect(seen.length, 'nothing was reported at all').toBeGreaterThan(0);
			expect(seen.at(-1)).toBe('abc');
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('reports blur separately, for touched-based validation', async () => {
		const onblur = vi.fn();
		const { target, component, field } = mountInput({ onblur });

		try {
			field.focus();
			field.blur();
			expect(onblur).toHaveBeenCalledTimes(1);
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('wires the error to the field when invalid, and not otherwise', () => {
		// Both arms, because "no `aria-invalid`" is also what a broken selector
		// produces. The negative arm is what tells them apart.
		const clean = mountInput();
		try {
			expect(clean.field.hasAttribute('aria-invalid')).toBe(false);
			expect(clean.field.hasAttribute('aria-describedby')).toBe(false);
		} finally {
			unmount(clean.component);
			clean.target.remove();
		}

		const invalid = mountInput({ invalid: true, errorId: 'pw-error' });
		try {
			expect(invalid.field.getAttribute('aria-invalid')).toBe('true');
			expect(invalid.field.getAttribute('aria-describedby')).toBe('pw-error');
		} finally {
			unmount(invalid.component);
			invalid.target.remove();
		}
	});

	it('marks itself invalid even with no message to point at', () => {
		// `errorId` is optional: a surface may show the failure elsewhere. The
		// field must still say it is invalid, and must not point `aria-describedby`
		// at an element that does not exist.
		const { target, component, field } = mountInput({ invalid: true });

		try {
			expect(field.getAttribute('aria-invalid')).toBe('true');
			expect(field.hasAttribute('aria-describedby')).toBe(false);
		} finally {
			unmount(component);
			target.remove();
		}
	});

	it('offers the autocomplete a password manager needs', () => {
		const signin = mountInput();
		try {
			expect(signin.field.getAttribute('autocomplete')).toBe('current-password');
		} finally {
			unmount(signin.component);
			signin.target.remove();
		}

		const signup = mountInput({ autocomplete: 'new-password' });
		try {
			expect(signup.field.getAttribute('autocomplete')).toBe('new-password');
		} finally {
			unmount(signup.component);
			signup.target.remove();
		}
	});

	it('disables the toggle along with the field', () => {
		// A toggle that still works on a disabled field reveals a password the
		// user cannot edit — and stays in the tab order while the field is out of
		// it, which is a jarring place for focus to land.
		const { target, component, field, toggle } = mountInput({ disabled: true });

		try {
			expect(field.disabled).toBe(true);
			expect(toggle.disabled).toBe(true);
		} finally {
			unmount(component);
			target.remove();
		}
	});
});

describe('Pattern A: it animates nothing', () => {
	it('declares no transition or animation on any of its own rules', () => {
		// `animation-policy.test.ts` reads the source; this reads the CSS the
		// browser actually resolved, which is what a consumer sees. Together they
		// cover both a stylesheet edit and a `style=` attribute.
		const { target, component, field, toggle } = mountInput();

		try {
			for (const element of [field, toggle]) {
				const computed = getComputedStyle(element);
				expect(computed.transitionDuration).toBe('0s');
				expect(computed.animationName).toBe('none');
			}
		} finally {
			unmount(component);
			target.remove();
		}
	});
});
