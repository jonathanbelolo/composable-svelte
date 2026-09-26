import type { ComponentProps } from 'svelte';
import Tabs from '../../src/lib/navigation-components/Tabs.svelte';
import NavigationStack from '../../src/lib/navigation-components/NavigationStack.svelte';
import AnimatedNavigationStack from '../../src/lib/navigation-components/AnimatedNavigationStack.svelte';
import TabsPrimitive from '../../src/lib/navigation-components/primitives/TabsPrimitive.svelte';
import NavigationStackPrimitive from '../../src/lib/navigation-components/primitives/NavigationStackPrimitive.svelte';
import type { ChildView } from '../../src/lib/navigation/managed-integration.js';

type Expect<T extends true> = T;
type PlainView = ChildView<{ value: number }, { type: 'increment' }>;
type Stores = [
  ComponentProps<typeof Tabs>['store'],
  ComponentProps<typeof NavigationStack>['store'],
  ComponentProps<typeof AnimatedNavigationStack>['store'],
  ComponentProps<typeof TabsPrimitive>['store'],
  ComponentProps<typeof NavigationStackPrimitive>['store']
];
type AllAcceptPlain = { [K in keyof Stores]: PlainView extends Stores[K] ? true : false };
type AllLackDismiss = { [K in keyof Stores]: 'dismiss' extends keyof NonNullable<Stores[K]> ? false : true };
export type CommonViewContract = [
  Expect<AllAcceptPlain[0]>, Expect<AllAcceptPlain[1]>, Expect<AllAcceptPlain[2]>,
  Expect<AllAcceptPlain[3]>, Expect<AllAcceptPlain[4]>,
  Expect<AllLackDismiss[0]>, Expect<AllLackDismiss[1]>, Expect<AllLackDismiss[2]>,
  Expect<AllLackDismiss[3]>, Expect<AllLackDismiss[4]>
];

import type { ScopedDestinationStore } from '../../src/lib/navigation/scope-to-destination.js';
import type { ScopedStore } from '../../src/lib/navigation/scope.js';
type RawLegacy = ScopedDestinationStore<{ value: number }, { type: 'increment' }>
  | ScopedStore<{ value: number }, { type: 'increment' }>;
type RejectsLegacy<T> = [Extract<RawLegacy, NonNullable<T>>] extends [never] ? true : false;
export type LegacyViewRejection = [
  Expect<RejectsLegacy<Stores[0]>>, Expect<RejectsLegacy<Stores[1]>>,
  Expect<RejectsLegacy<Stores[2]>>, Expect<RejectsLegacy<Stores[3]>>,
  Expect<RejectsLegacy<Stores[4]>>
];
