import { userEvent } from 'vitest/browser';
import { it, expect, vi, afterEach } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, mount, unmount } from 'svelte';
import { z } from 'zod';
vi.mock('../src/lib/store.svelte.js', { spy: true });
import { createStore } from '../src/lib/store.svelte.js';
import { createFormReducer, createInitialFormState } from '../src/lib/components/form/form.reducer.js';
import type { FormConfig } from '../src/lib/components/form/form.types.js';
import Input from '../src/lib/components/ui/input/Input.svelte';
import NumericValidityBinding from './fixtures/NumericValidityBinding.svelte';
import InputValidityForm from './fixtures/InputValidityForm.svelte';

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

it('binds badInput and reflects it on aria-invalid without corrupting value contract', async () => {
	const dispatch = vi.fn();
 const view = render(NumericValidityBinding, { dispatch });
 const target = view.container;
 const value = () => JSON.parse(target.querySelector('[data-value]')!.textContent!);
 const badInput = () => JSON.parse(target.querySelector('[data-validity]')!.textContent!);

	try {
		flushSync();
		const input = target.querySelector('input')!;
		expect(badInput()).toBe(false);
		expect(input.getAttribute('aria-invalid')).toBe('false');

		await userEvent.click(input);
		await userEvent.keyboard('1');
		expect(value()).toBe(1);
		expect(badInput()).toBe(false);
		expect(input.getAttribute('aria-invalid')).toBe('false');

		dispatch.mockClear();
		await userEvent.keyboard('e');
		expect(input.validity.badInput).toBe(true);
		expect(badInput()).toBe(true);
		expect(input.getAttribute('aria-invalid')).toBe('true');
		expect(value()).toBe(1);
		expect(dispatch).not.toHaveBeenCalled();

		await userEvent.keyboard('2');
		expect(input.validity.badInput).toBe(false);
		expect(badInput()).toBe(false);
		expect(input.getAttribute('aria-invalid')).toBe('false');
		expect(value()).toBe(100);
		expect(dispatch).toHaveBeenLastCalledWith({ type: 'changed', value: 100 });

		await userEvent.clear(input);
		expect(value()).toBe('');
		expect(badInput()).toBe(false);
		expect(input.getAttribute('aria-invalid')).toBe('false');
		expect(dispatch).toHaveBeenLastCalledWith({ type: 'changed', value: '' });
	} finally {
		await view.unmount();
	}
});

it('blocks submit on unfinished exponent via Form submit boundary and submits after correction', async () => {
	const onSubmit = vi.fn();
	const config: FormConfig<{ count: number }> = {
		schema: z.object({ count: z.number().min(1) }),
		initialData: { count: 1 },
		onSubmit
	};

	const view = render(InputValidityForm, { config });
	const input = view.container.querySelector('input')!;
	const submitBtn = view.container.querySelector('button[type="submit"]')!;
	const reportSpy = vi.spyOn(HTMLInputElement.prototype, 'reportValidity');

	await userEvent.click(input);
	await userEvent.keyboard('e');
	expect(input.validity.badInput).toBe(true);

	await userEvent.click(submitBtn);
	expect(reportSpy).toHaveBeenCalledTimes(1);
	expect(onSubmit).not.toHaveBeenCalled();

	await userEvent.keyboard('2');
	expect(input.validity.badInput).toBe(false);

	await userEvent.click(submitBtn);
	await expect.poll(() => onSubmit.mock.calls[0]?.[0]).toEqual({ count: 100 });
});

it('does not block submit on disabled inputs with badInput', async () => {
	const onSubmit = vi.fn();
	const config: FormConfig<{ count: number }> = {
		schema: z.object({ count: z.number() }),
		initialData: { count: 10 },
		onSubmit
	};

	const view = render(InputValidityForm, { config });
 const input = view.container.querySelector('input')!;
 await userEvent.click(input);
 await userEvent.keyboard('e');
 expect(input.validity.badInput).toBe(true);
 await view.rerender({config,disabled:true});
	const submitBtn = view.container.querySelector('button[type="submit"]')!;

	await userEvent.click(submitBtn);
	await expect.poll(() => onSubmit.mock.calls[0]?.[0]).toEqual({ count: 10 });
});

it('destroys standalone internal store on unmount and preserves integrated external store', async () => {
	const config: FormConfig<{ count: number }> = {
		schema: z.object({ count: z.number() }),
		initialData: { count: 5 },
		onSubmit: async () => {}
	};

	const createStoreSpy = vi.mocked(createStore);
	const internalView = render(InputValidityForm, { config });
	expect(createStoreSpy).toHaveBeenCalled();
	const internalStoreInstance = createStoreSpy.mock.results[0]?.value;
	const internalDestroySpy = vi.spyOn(internalStoreInstance, 'destroy');

	await internalView.unmount();
	expect(internalDestroySpy).toHaveBeenCalledTimes(1);

	const externalReducer = createFormReducer(config);
	const externalStore = createStore({
		initialState: createInitialFormState(config),
		reducer: externalReducer,
		dependencies: {}
	});
	const externalDestroySpy = vi.spyOn(externalStore, 'destroy');

	const externalView = render(InputValidityForm, { store: externalStore });
	await externalView.unmount();
	expect(externalDestroySpy).not.toHaveBeenCalled();

	externalStore.destroy();
	expect(externalDestroySpy).toHaveBeenCalledTimes(1);
});
