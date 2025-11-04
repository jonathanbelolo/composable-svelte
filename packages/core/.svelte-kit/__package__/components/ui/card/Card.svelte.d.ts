import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';
/**
 * Card container component.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Card Title</CardTitle>
 *     <CardDescription>Card description text</CardDescription>
 *   </CardHeader>
 *   <CardContent>
 *     <p>Card content goes here</p>
 *   </CardContent>
 *   <CardFooter>
 *     <Button>Action</Button>
 *   </CardFooter>
 * </Card>
 * ```
 */
interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Additional CSS classes.
     */
    class?: string;
    /**
     * Card content.
     */
    children: Snippet;
}
declare const Card: import("svelte").Component<CardProps, {}, "">;
type Card = ReturnType<typeof Card>;
export default Card;
//# sourceMappingURL=Card.svelte.d.ts.map