<script lang="ts">
	/**
	 * The component examples from
	 * `.claude/skills/composable-svelte-navigation/SKILL.md`, verbatim.
	 *
	 * `doc-typecheck` compiles the `<script>` body of a svelte fence and says so —
	 * markup expressions are out of its scope. This file is the markup half: the
	 * markup of every svelte fence in the skill, in order, and it is typechecked
	 * because `svelte-check` reads every `.svelte` under `tests`.
	 * `tests/repo/skill-examples.test.ts` compares the two so the copy cannot rot.
	 *
	 * The skill's scripts build every scoped store with `scopeToDestination`
	 * from one `store`; so does this file. Components the skill invents
	 * (`AddItemForm`, `Step1`, …) arrive as props, typed by what the markup
	 * passes them.
	 */
	import type { Component, ComponentProps, Snippet } from 'svelte';
	import {
		Alert as AlertImpl,
		AnimatedNavigationStack,
		Drawer,
		Modal,
		NavigationStack as NavigationStackImpl,
		Popover,
		Sheet
	} from '../../src/lib/navigation-components/index.js';
	import { Button } from '../../src/lib/components/ui/index.js';
	import { scopeToDestination } from '../../src/lib/navigation/index.js';
	import type {
		PresentationAction,
		PresentationState,
		ScopedDestinationStore
	} from '../../src/lib/navigation/index.js';
	import type { Store } from '../../src/lib/types.js';

	// ---- The state and actions the skill's markup reads and dispatches --------

	interface ModalMessage {
		title: string;
		message: string;
	}

	interface AddItemState {
		name: string;
		quantity: number;
	}

	type AddItemAction =
		| { type: 'nameChanged'; name: string }
		| { type: 'quantityChanged'; quantity: number }
		| { type: 'saveButtonTapped' };

	interface EditProfileState {
		name: string;
		email: string;
		bio: string;
	}

	type EditProfileAction =
		| { type: 'nameChanged'; name: string }
		| { type: 'emailChanged'; email: string }
		| { type: 'bioChanged'; bio: string }
		| { type: 'saveButtonTapped' }
		| { type: 'cancelButtonTapped' };

	interface FilterState {
		category: string;
		priceRange: [number, number];
		sortBy: 'name' | 'price' | 'date';
	}

	type FilterAction = { type: 'categoryChanged'; category: string };

	interface MenuState {
		itemId: string;
	}

	type MenuAction = { type: 'closed' };

	interface ConfirmDeleteState {
		itemName: string;
	}

	type ConfirmDeleteAction = { type: 'confirm' };

	type Screen = { type: 'step1' } | { type: 'step2' };

	type DestinationState =
		| { type: 'addItem'; state: AddItemState }
		| { type: 'editProfile'; state: EditProfileState }
		| { type: 'filters'; state: FilterState }
		| { type: 'menu'; state: MenuState }
		| { type: 'confirmDelete'; state: ConfirmDeleteState };

	type DestinationAction =
		| { type: 'addItem'; action: AddItemAction }
		| { type: 'editProfile'; action: EditProfileAction }
		| { type: 'filters'; action: FilterAction }
		| { type: 'menu'; action: MenuAction }
		| { type: 'confirmDelete'; action: ConfirmDeleteAction };

	interface AppState {
		content: ModalMessage | null;
		destination: DestinationState | null;
		stack: Screen[];
		presentation: PresentationState<Screen>;
	}

	type AppAction =
		| { type: 'hide' }
		| { type: 'menuOpened' }
		| { type: 'edit' }
		| { type: 'delete' }
		| { type: 'editProfileTapped' }
		| { type: 'addButtonTapped' }
		| { type: 'popped' }
		| { type: 'destination'; action: PresentationAction<DestinationAction> };

	// ---- Documented markup the real declarations reject -----------------------
	//
	// `Alert` and `NavigationStack` are declared over `<unknown, unknown>`, so
	// their `children` snippet hands back `store: ScopedDestinationStore<unknown,
	// unknown> | null` and `currentScreen: unknown`. The skill calls
	// `alertStore.dismiss()` (line 781) and reads `currentScreen.type` (line 1319)
	// on those, and neither compiles. The markup is pinned verbatim, so the
	// mismatch is confined to these two aliases, which re-declare only the
	// snippet field the skill assumes. Delete them when the skill is corrected.

	type AlertAsDocumented = Component<
		Omit<ComponentProps<typeof AlertImpl>, 'children'> & {
			children?: Snippet<[{ visible: boolean; store: ScopedDestinationStore<unknown, unknown> }]>;
		}
	>;
	const Alert = AlertImpl as unknown as AlertAsDocumented;

	type NavigationStackAsDocumented = Component<
		Omit<ComponentProps<typeof NavigationStackImpl>, 'children'> & {
			children?: Snippet<
				[
					{
						visible: boolean;
						store: ScopedDestinationStore<unknown, unknown> | null;
						currentScreen: Screen;
						canGoBack: boolean;
						onBack: (() => void) | undefined;
					}
				]
			>;
		}
	>;
	const NavigationStack = NavigationStackImpl as unknown as NavigationStackAsDocumented;

	// `NavigationStack` and `AnimatedNavigationStack` type `store` as a
	// `ScopedDestinationStore`, which has `dismiss()`; the skill passes the app
	// store (`{store}`, lines 1317 and 1329). The intersection is what that
	// markup demands of one value.
	let {
		store,
		AddItemForm,
		ModalContent,
		SheetContent,
		DrawerContent,
		EditProfileForm,
		FilterForm,
		Step1,
		Step2
	}: {
		store: Store<AppState, AppAction> & Pick<ScopedDestinationStore<unknown, unknown>, 'dismiss'>;
		AddItemForm: Component<{ store: ScopedDestinationStore<AddItemState, AddItemAction> }>;
		ModalContent: Component<{ store: ScopedDestinationStore<AddItemState, AddItemAction> }>;
		SheetContent: Component<{ store: ScopedDestinationStore<FilterState, FilterAction> }>;
		DrawerContent: Component<{ store: ScopedDestinationStore<MenuState, MenuAction> }>;
		EditProfileForm: Component<{
			store: ScopedDestinationStore<EditProfileState, EditProfileAction>;
		}>;
		FilterForm: Component<{ store: ScopedDestinationStore<FilterState, FilterAction> }>;
		Step1: Component<{ store: Store<AppState, AppAction> }>;
		Step2: Component<{ store: Store<AppState, AppAction> }>;
	} = $props();

	const addItemStore = $derived(
		scopeToDestination<AddItemState, AddItemAction>(store, ['destination'], 'addItem', 'destination')
	);
	const modalStore = $derived(
		scopeToDestination<AddItemState, AddItemAction>(store, ['destination'], 'addItem', 'destination')
	);
	const sheetStore = $derived(
		scopeToDestination<FilterState, FilterAction>(store, ['destination'], 'filters', 'destination')
	);
	const drawerStore = $derived(
		scopeToDestination<MenuState, MenuAction>(store, ['destination'], 'menu', 'destination')
	);
	const confirmStore = $derived(
		scopeToDestination<ConfirmDeleteState, ConfirmDeleteAction>(
			store,
			['destination'],
			'confirmDelete',
			'destination'
		)
	);
	const menuStore = $derived(
		scopeToDestination<MenuState, MenuAction>(store, ['destination'], 'menu', 'destination')
	);
	const editProfileStore = $derived(
		scopeToDestination<EditProfileState, EditProfileAction>(
			store,
			['destination'],
			'editProfile',
			'destination'
		)
	);
	const filterStore = $derived(
		scopeToDestination<FilterState, FilterAction>(store, ['destination'], 'filters', 'destination')
	);

	// The skill writes `let dialogElement: HTMLElement;` (lines 428 and 1008).
	// In a runes component a plain `let` written by `bind:this` is Svelte's
	// `non_reactive_update` warning, so the idiom here is `$state`.
	let dialogElement = $state<HTMLElement>();
	let sheetElement = $state<HTMLElement>();
</script>

<!-- SCOPING STORES FOR NAVIGATION: scopeToDestination Pattern -->
{#if addItemStore}
  <Modal store={addItemStore}>
    <AddItemForm store={addItemStore} />
  </Modal>
{/if}

<!-- PRESENTATIONSTATE LIFECYCLE: Complete Animated Modal Example, the component -->
{#if $store.content}
  <div class="modal-backdrop">
    <dialog bind:this={dialogElement}>
      <h2>{$store.content.title}</h2>
      <p>{$store.content.message}</p>
      <button onclick={() => store.dispatch({ type: 'hide' })}>
        Close
      </button>
    </dialog>
  </div>
{/if}

<!-- NAVIGATION COMPONENTS HOW-TO: Modal -->
{#if modalStore}
  <Modal
    store={modalStore}
  >
    <ModalContent store={modalStore} />
  </Modal>
{/if}

<!-- NAVIGATION COMPONENTS HOW-TO: Sheet -->
{#if sheetStore}
  <Sheet
    store={sheetStore}
  >
    <SheetContent store={sheetStore} />
  </Sheet>
{/if}

<!-- NAVIGATION COMPONENTS HOW-TO: Drawer -->
{#if drawerStore}
  <Drawer
    side="left"
    store={drawerStore}
  >
    <DrawerContent store={drawerStore} />
  </Drawer>
{/if}

<!-- NAVIGATION COMPONENTS HOW-TO: Alert -->
{#if confirmStore}
  <Alert store={confirmStore}>
    {#snippet children({ store: alertStore })}
      <h2 class="text-lg font-semibold">Delete Item?</h2>
      <p class="text-sm text-muted-foreground">This action cannot be undone.</p>
      <div class="flex justify-end gap-2">
        <Button onclick={() => alertStore.dismiss()}>Cancel</Button>
        <Button variant="destructive" onclick={() => alertStore.dispatch({ type: 'confirm' })}>
          Delete
        </Button>
      </div>
    {/snippet}
  </Alert>
{/if}

<!-- NAVIGATION COMPONENTS HOW-TO: Popover -->
<div class="relative">
  <Button onclick={() => store.dispatch({ type: 'menuOpened' })}>Options</Button>

  {#if menuStore}
    <Popover store={menuStore} style="top: 100%; left: 0;">
      {#snippet children()}
        <button onclick={() => store.dispatch({ type: 'edit' })}>Edit</button>
        <button onclick={() => store.dispatch({ type: 'delete' })}>Delete</button>
      {/snippet}
    </Popover>
  {/if}
</div>

<!-- COMPLETE EXAMPLES: Example 1, Modal with Edit Form, the component -->
<Button onclick={() => store.dispatch({ type: 'editProfileTapped' })}>
  Edit Profile
</Button>

{#if editProfileStore}
  <Modal
    store={editProfileStore}
  >
    <EditProfileForm store={editProfileStore} />
  </Modal>
{/if}

<!-- COMPLETE EXAMPLES: Example 2, Sheet with Animated Filters, the component -->
{#if filterStore}
  <Sheet
    store={filterStore}
  >
    <div bind:this={sheetElement}>
      <FilterForm store={filterStore} />
    </div>
  </Sheet>
{/if}

<!-- TEMPLATES: Navigation with Modal Template, App.svelte -->
<Button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
  Add Item
</Button>

{#if addItemStore}
  <Modal store={addItemStore}>
    <AddItemForm store={addItemStore} />
  </Modal>
{/if}

<!-- STACK NAVIGATION: NavigationStack Component -->
<!-- Basic (no animations) -->
<NavigationStack {store} stack={store.state.stack} onBack={() => store.dispatch({ type: 'popped' })}>
  {#snippet children({ currentScreen, canGoBack, onBack })}
    {#if currentScreen.type === 'step1'}
      <Step1 {store} />
    {:else if currentScreen.type === 'step2'}
      <Step2 {store} />
    {/if}
  {/snippet}
</NavigationStack>

<!-- With push/pop animations: also requires `presentation` -->
<AnimatedNavigationStack
  {store}
  stack={store.state.stack}
  presentation={store.state.presentation}
  onBack={() => store.dispatch({ type: 'popped' })}
>
  {#snippet children({ currentScreen })}
    <!-- same -->
  {/snippet}
</AnimatedNavigationStack>
