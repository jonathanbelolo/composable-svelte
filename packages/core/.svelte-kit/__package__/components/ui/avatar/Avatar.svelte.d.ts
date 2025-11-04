import type { HTMLImgAttributes } from 'svelte/elements';
/**
 * Avatar component for displaying user profile images with fallback support.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- With image -->
 * <Avatar src="/user.jpg" alt="John Doe" fallback="JD" />
 *
 * <!-- With initials only -->
 * <Avatar fallback="AB" size="lg" />
 *
 * <!-- Custom styling -->
 * <Avatar src="/avatar.png" alt="User" fallback="U" class="ring-2 ring-primary" />
 * ```
 */
interface AvatarProps extends Omit<HTMLImgAttributes, 'class' | 'src' | 'alt'> {
    /**
     * Image source URL (optional).
     */
    src?: string;
    /**
     * Alternative text for the image.
     */
    alt?: string;
    /**
     * Fallback text to display when image fails to load or is not provided.
     * Typically initials (e.g., "JD" for John Doe).
     */
    fallback: string;
    /**
     * Size variant of the avatar.
     */
    size?: 'sm' | 'md' | 'lg' | 'xl';
    /**
     * Additional CSS classes.
     */
    class?: string;
}
declare const Avatar: import("svelte").Component<AvatarProps, {}, "">;
type Avatar = ReturnType<typeof Avatar>;
export default Avatar;
//# sourceMappingURL=Avatar.svelte.d.ts.map