import type { Snippet } from 'svelte';
interface CommandGroupProps {
    /**
     * Group label/heading.
     */
    label: string;
    /**
     * Command items in this group.
     */
    children?: Snippet;
    /**
     * Additional CSS classes.
     */
    class?: string;
}
/**
 * CommandGroup Component
 *
 * Optional grouped commands display with a header label.
 */
declare const CommandGroup: import("svelte").Component<CommandGroupProps, {}, "">;
type CommandGroup = ReturnType<typeof CommandGroup>;
export default CommandGroup;
//# sourceMappingURL=CommandGroup.svelte.d.ts.map