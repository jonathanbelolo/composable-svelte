import type { ScopedDestinationStore } from '../../navigation/scope-to-destination.js';
import type { PresentationState } from '../../navigation/types.js';
import type { SpringConfig } from '../../animation/spring-config.js';
interface ModalPrimitiveProps<State, Action> {
    /**
     * Scoped store for the modal content.
     * When null, modal is hidden. When non-null, modal is visible.
     */
    store: ScopedDestinationStore<State, Action> | null;
    /**
     * Presentation state for animation lifecycle.
     * Optional - if not provided, no animations (instant show/hide).
     */
    presentation?: PresentationState<any>;
    /**
     * Callback when presentation animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'presentationCompleted' } }
     */
    onPresentationComplete?: () => void;
    /**
     * Callback when dismissal animation completes.
     * Dispatch this to store: { type: 'presentation', event: { type: 'dismissalCompleted' } }
     */
    onDismissalComplete?: () => void;
    /**
     * Spring configuration override.
     */
    springConfig?: Partial<SpringConfig>;
    /**
     * Disable click-outside to dismiss.
     * @default false
     */
    disableClickOutside?: boolean;
    /**
     * Disable Escape key to dismiss.
     * @default false
     */
    disableEscapeKey?: boolean;
    /**
     * Element to return focus to when modal is dismissed.
     * Typically the button that opened the modal.
     * If not provided, focus returns to the element that was focused before modal opened.
     * @default null
     */
    returnFocusTo?: HTMLElement | null;
}
declare const ModalPrimitive: import("svelte").Component<ModalPrimitiveProps<unknown, unknown>, {}, "">;
type ModalPrimitive = ReturnType<typeof ModalPrimitive>;
export default ModalPrimitive;
//# sourceMappingURL=ModalPrimitive.svelte.d.ts.map