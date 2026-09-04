<script lang="ts">
	/**
	 * The component examples from `.claude/skills/composable-svelte-forms/SKILL.md`,
	 * verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half, and it
	 * is typechecked because `svelte-check` reads every `.svelte` under `tests`.
	 * `tests/repo/skill-examples.test.ts` compares the two so the copy cannot rot.
	 *
	 * Four fences are anti-patterns: a WRONG half followed by a CORRECT half, in one
	 * fence. The WRONG halves name things that do not exist in core — a prop-based
	 * `FormField`, `field.oninput`, `SelectTrigger` and friends, `onValueChange`,
	 * a `{ type: 'submit' }` action — and the two halves must stay contiguous for
	 * the comparison. Each of those fences therefore sits in a typed `{#snippet}`
	 * whose parameters are the stand-ins, shadowing the real import for that block
	 * only. Everything fictional is in a parameter list; nothing at the top level is.
	 */
	import type { Component, Snippet } from 'svelte';
	import type { FocusEventHandler, FormEventHandler } from 'svelte/elements';
	import {
		Form,
		FormField,
		FormItem,
		FormLabel,
		FormMessage
	} from '../../src/lib/components/form/index.js';
	import type {
		FieldRenderProps,
		FieldRenderState,
		FormAction,
		FormConfig,
		FormState,
		FormStore
	} from '../../src/lib/components/form/index.js';
	import { Button, Input, Select, Switch, Textarea } from '../../src/lib/components/ui/index.js';
	import type { Store } from '../../src/lib/types.js';

	/** The skill's `ContactData`, minus the Zod schema that infers it. */
	interface ContactData {
		name: string;
		email: string;
		message: string;
	}

	interface Submission {
		name: string;
		email: string;
		at: Date;
	}

	/** The skill's parent state and actions, step 3. */
	interface AppState {
		contactForm: FormState<ContactData>;
		submissions: Submission[];
		successMessage: string | null;
	}

	type AppAction =
		| { type: 'contactForm'; action: FormAction<ContactData> }
		| { type: 'successMessageDismissed' };

	/**
	 * Every field the wiring-reference fences address, gathered into one shape
	 * so a single `send` accepts them all.
	 */
	interface ExampleData {
		name: string;
		email: string;
		message: string;
		quantity: number;
		fruit: string;
		isActive: boolean;
		date: string;
		active: boolean;
	}

	let {
		store,
		onSuccess,
		contactFormConfig,
		field,
		send
	}: {
		store: Store<AppState, AppAction>;
		onSuccess?: () => void;
		contactFormConfig: FormConfig<ContactData>;
		field: FieldRenderState;
		send: FieldRenderProps<ExampleData>['send'];
	} = $props();

	// The reactive wrapper from step 5 of the skill, as written there.
	let formStoreState = $state(store.state.contactForm);
	$effect(() => {
		formStoreState = store.state.contactForm;
	});

	const formStore = {
		get state() {
			return formStoreState;
		},
		dispatch(action: FormAction<ContactData>) {
			store.dispatch({ type: 'contactForm', action });
		},
		subscribe(listener: (s: typeof formStoreState) => void) {
			return store.subscribe((s) => listener(s.contactForm));
		}
	};

	// ---- Stand-ins for the anti-pattern fences. None of these exist. ----

	/** The `send` of the WRONG halves: the real union plus the two actions they invent. */
	type WrongSend = (
		action: FormAction<ExampleData> | { type: 'changed' | 'toggled'; value: unknown }
	) => void;

	/**
	 * Anti-pattern 1. The old prop-based `FormField` the WRONG half uses, which also
	 * has to serve the CORRECT half in the same fence — whose `field.oninput` and
	 * `field.onblur` are not on `FieldRenderState` either.
	 */
	type WrongFormField = Component<{
		name?: string;
		field?: string;
		send?: FieldRenderProps<ExampleData>['send'];
		state?: FormState<ExampleData>;
		children?: Snippet<
			[
				{
					field: FieldRenderState & {
						oninput: FormEventHandler<HTMLInputElement>;
						onblur: FocusEventHandler<HTMLInputElement>;
					};
					send: FieldRenderProps<ExampleData>['send'];
				}
			]
		>;
	}>;

	/**
	 * Anti-pattern 2. The real `Select`'s props, made optional because the WRONG
	 * half omits `options`, plus the callback and children it invents.
	 */
	type WrongSelect = Component<
		Partial<{
			value: string | string[] | null;
			options: { value: string; label: string; disabled?: boolean }[];
			onchange: (value: string | string[] | null) => void;
			placeholder: string;
		}> & {
			onValueChange?: (value: unknown) => void;
			children?: Snippet;
		}
	>;
	type WrongSelectPart = Component<{ children?: Snippet }>;
	type WrongSelectValue = Component<Record<never, never>>;
	type WrongSelectItem = Component<{ value: string; children?: Snippet }>;

	/**
	 * Anti-pattern 3. The props of `Switch` the fence uses, plus the callback the
	 * WRONG half invents. The real `Switch` would accept `onCheckedChange` through
	 * its `[key: string]: any` index signature — and give `v` an implicit `any`.
	 * `checked` is bindable because the real one is `$bindable`.
	 */
	type WrongSwitch = Component<
		{
			checked?: boolean;
			onclick?: () => void;
			onCheckedChange?: (value: unknown) => void;
		},
		Record<never, never>,
		'checked'
	>;

	/** Anti-pattern 4. A form store that also takes the `{ type: 'submit' }` the WRONG half dispatches. */
	type WrongFormStore = FormStore<ContactData> & {
		dispatch(action: { type: 'submit' }): void;
	};
</script>

<!-- Two Modes: standalone -->
<!-- Standalone: Form owns the store. Good for prototypes and self-contained forms. -->
<Form config={contactFormConfig}>
  <FormField name="name">
    {#snippet children({ field, send })}
      <Input value={field.value} oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })} />
    {/snippet}
  </FormField>
</Form>

<!-- Complete example, step 5: component with reactive wrapper -->
<Form store={formStore}>
  <div class="space-y-6">

    <!-- Text Input -->
    <FormField name="name">
      {#snippet children({ field, send })}
        <FormItem>
          <FormLabel>Name *</FormLabel>
          <Input
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
            placeholder="John Doe"
          />
          <FormMessage />
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Email Input -->
    <FormField name="email">
      {#snippet children({ field, send })}
        <FormItem>
          <FormLabel>Email *</FormLabel>
          <Input
            type="email"
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'email', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'email' })}
            placeholder="john@example.com"
          />
          <FormMessage />
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Textarea -->
    <FormField name="message">
      {#snippet children({ field, send })}
        <FormItem>
          <FormLabel>Message *</FormLabel>
          <Textarea
            value={field.value}
            oninput={(e) => send({ type: 'fieldChanged', field: 'message', value: e.currentTarget.value })}
            onblur={() => send({ type: 'fieldBlurred', field: 'message' })}
            rows={4}
            placeholder="Your message here..."
          />
          <FormMessage />
        </FormItem>
      {/snippet}
    </FormField>

    <!-- Submit -->
    {#if formStoreState?.submitError}
      <div class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{formStoreState.submitError}</div>
    {/if}
    <div class="flex gap-3">
      <Button type="submit" disabled={formStoreState?.isSubmitting}>
        {formStoreState?.isSubmitting ? 'Sending...' : 'Send Message'}
      </Button>
      <Button variant="outline" onclick={() => onSuccess?.()}>Cancel</Button>
    </div>

  </div>
</Form>

<!-- FormField component: the core pattern -->
<FormField name="fieldName">
  {#snippet children({ field, send })}
    <FormItem>
      <FormLabel>Label</FormLabel>
      <!-- input component here -->
      <FormMessage />
    </FormItem>
  {/snippet}
</FormField>

<!-- Input wiring reference: Text Input -->
<Input
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'name', value: e.currentTarget.value })}
  onblur={() => send({ type: 'fieldBlurred', field: 'name' })}
/>

<!-- Input wiring reference: Number Input -->
<Input
  type="number"
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'quantity', value: Number(e.currentTarget.value) })}
  onblur={() => send({ type: 'fieldBlurred', field: 'quantity' })}
/>

<!-- Input wiring reference: Textarea -->
<Textarea
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'message', value: e.currentTarget.value })}
  onblur={() => send({ type: 'fieldBlurred', field: 'message' })}
  rows={4}
/>

<!-- Input wiring reference: Select (Dropdown) -->
<Select
  value={field.value}
  options={[
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
  ]}
  onchange={(v) => send({ type: 'fieldChanged', field: 'fruit', value: v })}
  placeholder="Select..."
/>

<!-- Input wiring reference: Switch (Toggle) -->
<Switch
  checked={field.value}
  onclick={() => send({ type: 'fieldChanged', field: 'isActive', value: !field.value })}
/>

<!-- Input wiring reference: Date Input -->
<input
  type="date"
  class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
  value={field.value}
  oninput={(e) => send({ type: 'fieldChanged', field: 'date', value: e.currentTarget.value })}
  onblur={() => send({ type: 'fieldBlurred', field: 'date' })}
/>

<!-- Form state reference: Accessing Field Errors -->
// Via FormMessage component (automatic — reads from context)
<FormMessage />

// Manual access
{#if field.error && field.touched}
  <p class="text-sm text-destructive">{field.error}</p>
{/if}

<!-- Anti-pattern 1: Wrong FormField API. `FormField` and `state` are stand-ins (see the script). -->
{#snippet antiPattern1(FormField: WrongFormField, state: FormState<ExampleData>)}
<!-- WRONG — old prop-based API that doesn't exist -->
<FormField field="name" {send} {state}>
  <input type="text" />
</FormField>

<!-- CORRECT — snippet-based API -->
<FormField name="name">
  {#snippet children({ field, send })}
    <FormItem>
      <FormLabel>Name</FormLabel>
      <Input value={field.value} oninput={field.oninput} onblur={field.onblur} />
      <FormMessage />
    </FormItem>
  {/snippet}
</FormField>
{/snippet}

<!-- Anti-pattern 2: Wrong Select API. Every parameter is a stand-in (see the script). -->
{#snippet antiPattern2(
	Select: WrongSelect,
	SelectTrigger: WrongSelectPart,
	SelectValue: WrongSelectValue,
	SelectContent: WrongSelectPart,
	SelectItem: WrongSelectItem,
	send: WrongSend
)}
<!-- WRONG — onValueChange doesn't exist, child components not supported -->
<Select value={field.value} onValueChange={(v) => send({ type: 'changed', value: v })}>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
  </SelectContent>
</Select>

<!-- CORRECT — onchange + options prop -->
<Select
  value={field.value}
  options={[{ value: 'a', label: 'A' }]}
  onchange={(v) => send({ type: 'fieldChanged', field: 'name', value: v })}
/>
{/snippet}

<!-- Anti-pattern 3: Wrong Switch API. Both parameters are stand-ins (see the script). -->
{#snippet antiPattern3(Switch: WrongSwitch, send: WrongSend)}
<!-- WRONG -->
<Switch checked={field.value} onCheckedChange={(v) => send({ type: 'toggled', value: v })} />
<Switch bind:checked={field.value} />

<!-- CORRECT -->
<Switch checked={field.value} onclick={() => send({ type: 'fieldChanged', field: 'active', value: !field.value })} />
{/snippet}

<!-- Anti-pattern 4: Raw form instead of Form component. `formStore` is a stand-in (see the script); `Form` is real. -->
{#snippet antiPattern4(formStore: WrongFormStore)}
<!-- WRONG — manual form, bypasses Form component's submit handling -->
<form onsubmit={(e) => { e.preventDefault(); formStore.dispatch({ type: 'submit' }); }}>
  <!-- fields -->
</form>

<!-- CORRECT — Form component handles submit internally -->
<Form store={formStore}>
  <!-- fields -->
</Form>
{/snippet}
