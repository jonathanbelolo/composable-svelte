// Test-only observation of the Modal's completion callbacks (see app.browser.test.ts). The real Modal is stored
// here by the module mock; ModalProbe.svelte renders it with every prop forwarded and logs each callback the Modal
// actually delivers, before passing it on to the app's own callback.
import type { Component } from 'svelte';

export type Delivery = 'presentationComplete' | 'dismissalComplete';
export const modalProbe: { Modal: Component<Record<string, unknown>> | null; deliveries: Delivery[] } = { Modal: null, deliveries: [] };
