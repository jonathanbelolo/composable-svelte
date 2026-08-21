/**
 * `fieldFocused` was a documented no-op.
 *
 * ```
 * case 'fieldFocused': {
 *   // Currently no-op, but can be extended for focus tracking
 *   return [state, Effect.none()];
 * }
 * ```
 *
 * `FormControl` dispatches it on every `onfocus`, so the action was reachable,
 * carried a field name, and changed nothing. Nothing downstream could style a
 * focused field from form state: `data-touched` and `data-dirty` were on the
 * control props and there was no focus counterpart.
 *
 * What it must NOT do is set `touched`. `touched` gates error display, so
 * touching on focus fires "required" errors at every field the user tabs
 * through, before they have typed anything. Focus and touch are different
 * events; `fieldBlurred` remains the one that touches.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { z } from 'zod';
import { render } from 'vitest-browser-svelte';
import { createTestStore } from '../src/lib/test/test-store.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';
import FormFocusTest from './test-components/FormFocusTest.svelte';

interface Data {
	name: string;
	email: string;
}

const config: FormConfig<Data> = {
	schema: z.object({ name: z.string().min(2, 'too short'), email: z.string().email() }),
	initialData: { name: '', email: '' },
	onSubmit: async () => {}
};

const makeStore = () =>
	createTestStore({
		initialState: createInitialFormState(config),
		reducer: createFormReducer(config)
	});

describe('fieldFocused in the reducer', () => {
	it('records which field has focus', async () => {
		const store = makeStore();

		await store.send({ type: 'fieldFocused', field: 'name' }, (state) => {
			expect(state.focusedField).toBe('name');
		});

		store.assertNoPendingActions();
	});

	it('does not mark the field touched', async () => {
		// The whole reason focus and touch stay separate: `touched` gates error
		// display, so touching on focus shows "too short" on an empty field the
		// user has only tabbed into.
		const store = makeStore();

		await store.send({ type: 'fieldFocused', field: 'name' }, (state) => {
			expect(state.fields.name.touched).toBe(false);
			expect(state.fields.name.error).toBeNull();
		});
	});

	it('moves with focus', async () => {
		const store = makeStore();

		await store.send({ type: 'fieldFocused', field: 'name' });
		await store.send({ type: 'fieldFocused', field: 'email' }, (state) => {
			expect(state.focusedField).toBe('email');
		});
	});

	it('is cleared by a blur of that field, which does touch it', async () => {
		const store = makeStore();

		await store.send({ type: 'fieldFocused', field: 'name' });
		await store.send({ type: 'fieldBlurred', field: 'name' }, (state) => {
			expect(state.focusedField).toBeNull();
			expect(state.fields.name.touched, 'blur is what touches').toBe(true);
		});
	});

	it('is not cleared by a blur of some other field', async () => {
		// Focus can already have moved on by the time a stale blur is processed;
		// clearing unconditionally would blank the attribute on the live field.
		const store = makeStore();

		await store.send({ type: 'fieldFocused', field: 'email' });
		await store.send({ type: 'fieldBlurred', field: 'name' }, (state) => {
			expect(state.focusedField).toBe('email');
		});
	});
});

let cleanup: Array<() => void> = [];
afterEach(() => {
	cleanup.forEach((fn) => fn());
	cleanup = [];
});

describe('data-focused on the rendered control', () => {
	const settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));

	function mount() {
		const screen = render(FormFocusTest);
		cleanup.push(() => screen.unmount());
		const root = screen.container;
		return {
			input: (id: string) => root.querySelector<HTMLInputElement>(`[data-testid="${id}"]`)!
		};
	}

	it('appears on focus and moves with it', async () => {
		const form = mount();
		expect(form.input('name').hasAttribute('data-focused')).toBe(false);

		form.input('name').focus();
		await settle();
		expect(form.input('name').hasAttribute('data-focused')).toBe(true);
		expect(form.input('email').hasAttribute('data-focused')).toBe(false);

		form.input('email').focus();
		await settle();
		expect(form.input('name').hasAttribute('data-focused')).toBe(false);
		expect(form.input('email').hasAttribute('data-focused')).toBe(true);
	});

	it('does not set data-touched on focus alone', async () => {
		const form = mount();
		form.input('name').focus();
		await settle();

		expect(
			form.input('name').hasAttribute('data-touched'),
			'focusing a field must not arm its error display'
		).toBe(false);
	});
});
