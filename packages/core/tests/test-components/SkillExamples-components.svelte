<script lang="ts">
	/**
	 * The component examples from
	 * `.claude/skills/composable-svelte-components/SKILL.md`, verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half: every
	 * `svelte` fence's markup, in order, and it is typechecked because
	 * `svelte-check` reads every `.svelte` under `tests`.
	 * `tests/repo/skill-examples.test.ts` compares the two.
	 *
	 * Several fences open with a bare `import { … } from '…';` line outside any
	 * `<script>`. The comparison keeps that line, so it is here as markup, where
	 * Svelte reads `{ A, B }` as a comma expression and TypeScript reports TS2695
	 * on it. A `@ts-expect-error` mustache precedes each such line — and only
	 * those with more than one name, because a lone `{ A }` is a plain identifier.
	 *
	 * Three things the skill uses do not exist in this package and are declared as
	 * props instead: `ProductDetail` (an app component), `lucide-svelte`'s icons,
	 * and a `Toaster` taking `toasts` / `position` — the real one takes `store`.
	 * Two more are declared as props because the skill's markup does not compile
	 * against the real component: `Modal`, whose `children` snippet receives
	 * `store: … | null`, so `scoped.dismiss()` is a null-safety error; and
	 * `Checkbox`, whose restProps are `[key: string]: any`, so the `e` in
	 * `onchange={(e) => …}` is an implicit `any`.
	 */
	import type { Component, Snippet } from 'svelte';
	import {
		Accordion,
		AccordionContent,
		AccordionItem,
		AccordionTrigger,
		Avatar,
		Badge,
		Button,
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle,
		Input,
		Progress,
		Radio,
		RadioGroup,
		Select,
		Skeleton,
		Spinner,
		Switch
	} from '../../src/lib/components/ui/index.js';
	import {
		DataTable,
		DataTableHeader,
		DataTablePagination
	} from '../../src/lib/components/data-table/index.js';
	import type { TableAction, TableState } from '../../src/lib/components/data-table/index.js';
	import type { Toast, ToastState } from '../../src/lib/components/toast/toast.types.js';
	import { Tabs } from '../../src/lib/navigation-components/index.js';
	import type { ScopedDestinationStore } from '../../src/lib/navigation/scope-to-destination.js';
	import type { PresentationEvent, PresentationState } from '../../src/lib/navigation/types.js';
	import type { Store } from '../../src/lib/types.js';

	type User = { id: string; name: string; email: string; status: string };
	type Product = { id: string; name: string; category: string; price: number };
	type FaqItem = { id: string; question: string; answer: string };

	type ProductDetailState = { productId: string };
	type ProductDetailAction = { type: 'backTapped' };
	type Destination = { type: 'detail'; state: ProductDetailState };
	type DetailStore = ScopedDestinationStore<ProductDetailState, ProductDetailAction>;

	type State = {
		name: string;
		isSubmitting: boolean;
		nameError: string | null;
		category: string | null;
		agreeToTerms: boolean;
		plan: string | null;
		notifications: boolean;
		users: User[];
		products: Product[];
		status: 'active' | 'inactive';
		user: { avatarUrl: string; name: string; initials: string };
		toasts: ToastState;
		uploadProgress: number | null;
		isLoading: boolean;
		content: string;
		faqItems: FaqItem[];
		presentation: PresentationState<Destination>;
		activeTabIndex: number;
		hasErrors: boolean;
		count: number;
	};

	type Action =
		| { type: 'nameChanged'; name: string }
		| { type: 'categoryChanged'; category: string | string[] | null }
		| { type: 'toggleTerms'; checked: boolean }
		| { type: 'planChanged'; plan: string | null }
		| { type: 'notificationsToggled' }
		| { type: 'addToCart'; productId: string }
		| { type: 'faqExpanded'; id: string }
		| { type: 'presentation'; event: PresentationEvent }
		| { type: 'tabChanged'; index: number }
		| { type: 'buttonClicked' };

	let {
		store,
		tableStore,
		detailStore,
		scopedStore,
		Modal,
		Checkbox,
		ProductDetail,
		Toaster,
		ChevronDown,
		Plus,
		Search,
		label,
		variant = 'primary'
	}: {
		store: Store<State, Action>;
		tableStore: Store<TableState<User>, TableAction<User>>;
		detailStore: DetailStore | null;
		scopedStore: DetailStore;
		Modal: Component<{
			store: DetailStore | null;
			presentation?: PresentationState<Destination>;
			onDismissalComplete?: () => void;
			children?: Snippet<[{ visible: boolean; store: DetailStore }]>;
		}>;
		Checkbox: Component<{
			checked?: boolean;
			onchange?: (event: Event & { currentTarget: EventTarget & HTMLInputElement }) => void;
		}>;
		ProductDetail: Component<{ store: DetailStore; onBack: () => void }>;
		Toaster: Component<{ toasts: Toast[]; position: ToastState['position'] }>;
		ChevronDown: Component;
		Plus: Component;
		Search: Component;
		label: string;
		variant?: 'primary' | 'secondary';
	} = $props();

	let plan = $state(store.state.plan);
	$effect(() => store.dispatch({ type: 'planChanged', plan }));

	const isDisabled = $derived(store.state.isLoading || store.state.hasErrors);
	const displayText = $derived(
		store.state.count > 0 ? `${label} (${store.state.count})` : label
	);
</script>

<!-- Icons -->
{/* @ts-expect-error TS2695: this prose import line is a comma expression to svelte-check */ ''}
import { ChevronDown, Plus, Search } from 'lucide-svelte';

<!-- Navigation components: shared props -->
import { Modal } from '@composable-svelte/core';

{#if detailStore}
  <Modal
    store={detailStore}
    presentation={store.state.presentation}
    onDismissalComplete={() => store.dispatch({
      type: 'presentation', event: { type: 'dismissalCompleted' }
    })}
  >
    {#snippet children({ store: scoped })}
      <ProductDetail store={scoped} onBack={() => scoped.dismiss()} />
    {/snippet}
  </Modal>
{/if}

<!-- Tabs -->
<Tabs
  store={scopedStore}
  tabs={['Overview', 'Analytics', 'Reports']}
  activeTab={store.state.activeTabIndex}
  onTabChange={(index) => store.dispatch({ type: 'tabChanged', index })}
/>

<!-- Input -->
import { Input } from '@composable-svelte/core/components/ui';

<Input
  type="text"
  value={$store.name}
  oninput={(e) => store.dispatch({ type: 'nameChanged', name: e.currentTarget.value })}
  placeholder="Enter name"
  disabled={$store.isSubmitting}
/>

{#if $store.nameError}
  <span class="error">{$store.nameError}</span>
{/if}

<!-- Select -->
import { Select } from '@composable-svelte/core/components/ui';

<Select
  value={store.state.category}
  options={[
    { label: 'Electronics', value: 'electronics' },
    { label: 'Clothing', value: 'clothing' }
  ]}
  onchange={(value) => store.dispatch({ type: 'categoryChanged', category: value })}
  placeholder="Select category"
/>

<!-- Checkbox -->
<label class="flex items-center gap-2">
  <Checkbox
    checked={store.state.agreeToTerms}
    onchange={(e) => store.dispatch({ type: 'toggleTerms', checked: e.currentTarget.checked })}
  />
  <span>I agree to the terms and conditions</span>
</label>

<!-- RadioGroup -->
<RadioGroup bind:value={plan}>
  <Radio value="free">Free</Radio>
  <Radio value="pro">Pro ($9/mo)</Radio>
</RadioGroup>

<!-- Switch -->
<Switch
  checked={store.state.notifications}
  onclick={() => store.dispatch({ type: 'notificationsToggled' })}
/>

<!-- DataTable. The fence's script builds a table store named `store`; the app
     store above already has that name, so the fence's markup is a snippet whose
     parameter is the table store. -->
{#snippet dataTableExample(store: Store<TableState<User>, TableAction<User>>)}
<DataTable {store}>
  {#snippet header()}
    <DataTableHeader {store} columns={[
      { key: 'name', label: 'Name', sortable: true },
      { key: 'email', label: 'Email' }
    ]} />
  {/snippet}
  {#snippet row(user: User)}
    <tr class="border-b">
      <td class="p-4">{user.name}</td>
      <td class="p-4">{user.email}</td>
    </tr>
  {/snippet}
</DataTable>
<DataTablePagination {store} pageSizeOptions={[10, 25, 50]} />
{/snippet}
{@render dataTableExample(tableStore)}

<!-- DataTable: plain HTML table -->
<table class="w-full text-sm">
  <thead>
    <tr class="border-b text-left text-muted-foreground">
      <th class="px-4 py-3 font-medium">Name</th>
      <th class="px-4 py-3 font-medium">Email</th>
      <th class="px-4 py-3 font-medium">Status</th>
    </tr>
  </thead>
  <tbody>
    {#each $store.users as user (user.id)}
      <tr class="border-b hover:bg-muted/50">
        <td class="px-4 py-3">{user.name}</td>
        <td class="px-4 py-3">{user.email}</td>
        <td class="px-4 py-3">{user.status}</td>
      </tr>
    {/each}
  </tbody>
</table>

<!-- Card -->
{/* @ts-expect-error TS2695: this prose import line is a comma expression to svelte-check */ ''}
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components/ui';

{#each $store.products as product (product.id)}
  <Card>
    <CardHeader>
      <CardTitle>{product.name}</CardTitle>
      <CardDescription>{product.category}</CardDescription>
    </CardHeader>
    <CardContent>
      <p>${product.price}</p>
      <Button onclick={() => store.dispatch({ type: 'addToCart', productId: product.id })}>
        Add to Cart
      </Button>
    </CardContent>
  </Card>
{/each}

<!-- Badge -->
import { Badge } from '@composable-svelte/core/components/ui';

<Badge variant={$store.status === 'active' ? 'success' : 'secondary'}>
  {$store.status}
</Badge>

<!-- Avatar -->
import { Avatar } from '@composable-svelte/core/components/ui';

<Avatar
  src={$store.user?.avatarUrl}
  alt={$store.user?.name}
  fallback={$store.user?.initials}
/>

<!-- Toast -->
<!-- Controlled: you own the state, you render it -->
<Toaster toasts={store.state.toasts.toasts} position="bottom-right" />

<!-- Progress -->
import { Progress } from '@composable-svelte/core/components/ui';

{#if $store.uploadProgress !== null}
  <Progress value={$store.uploadProgress} max={100} />
  <p>{$store.uploadProgress}% uploaded</p>
{/if}

<!-- Skeleton -->
import { Skeleton } from '@composable-svelte/core/components/ui';

{#if $store.isLoading}
  <Skeleton class="h-4 w-full mb-2" />
  <Skeleton class="h-4 w-3/4 mb-2" />
  <Skeleton class="h-4 w-1/2" />
{:else}
  <p>{$store.content}</p>
{/if}

<!-- Spinner -->
import { Spinner } from '@composable-svelte/core/components/ui';

{#if store.state.isLoading}
  <Spinner size="lg" />
{/if}

<!-- Accordion -->
{/* @ts-expect-error TS2695: this prose import line is a comma expression to svelte-check */ ''}
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
  from '@composable-svelte/core/components/ui';

<Accordion
  initialExpandedIds={['faq-1']}
  allowMultiple
  onExpand={(id) => store.dispatch({ type: 'faqExpanded', id })}
>
  {#each store.state.faqItems as item (item.id)}
    <AccordionItem id={item.id}>
      <AccordionTrigger>{item.question}</AccordionTrigger>
      <AccordionContent>{item.answer}</AccordionContent>
    </AccordionItem>
  {/each}
</Accordion>

<!-- Custom component guidelines -->
<button
  class={variant}
  disabled={isDisabled}
  onclick={() => store.dispatch({ type: 'buttonClicked' })}
>
  {displayText}
</button>

<!-- Styling patterns: Tailwind integration -->
<Button class="bg-primary text-primary-foreground hover:bg-primary/90">
  Click me
</Button>

<!-- Styling patterns: custom styles. The fence puts `custom-card` on a component,
     which a scoped rule cannot reach, so Svelte reports the selector unused; the
     element after the style block is what keeps that warning out of this file. -->
<Card class="custom-card">
  <CardContent>
    ...
  </CardContent>
</Card>

<style>
  .custom-card {
    background: linear-gradient(to right, #667eea 0%, #764ba2 100%);
  }
</style>

<div class="custom-card"></div>
