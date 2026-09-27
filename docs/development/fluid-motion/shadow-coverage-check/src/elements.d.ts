declare module 'svelte/elements' {
  interface SvelteHTMLElements {
    'closed-badge': import('svelte/elements').HTMLAttributes<HTMLElement> & { label?: string; animated?: boolean };
    'closed-slot-card': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'light-card': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'closed-serial': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'pair-light': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'pair-closed': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'serial-nested': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'serial-adopted': import('svelte/elements').HTMLAttributes<HTMLElement>;
    'serial-with-child': import('svelte/elements').HTMLAttributes<HTMLElement>;
  }
}
export {};
