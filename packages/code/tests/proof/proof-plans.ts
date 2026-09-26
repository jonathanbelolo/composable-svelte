import { defineViews } from '@composable-svelte/core/application';
import { composition } from './proof-model';
import ProofEditor from './ProofEditor.svelte';
import CoalescingProbe from './CoalescingProbe.svelte';

export const queueViews = defineViews(composition, {
	editors: { render: ProofEditor },
	panel: { render: ProofEditor }
});

export const coalescingViews = defineViews(composition, {
	editors: { render: CoalescingProbe },
	panel: { render: CoalescingProbe }
});

export type ProofViews = typeof queueViews;
