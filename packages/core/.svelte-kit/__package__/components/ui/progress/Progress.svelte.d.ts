import type { HTMLAttributes } from 'svelte/elements';
/**
 * Progress component for displaying linear progress bars.
 *
 * @packageDocumentation
 *
 * @example
 * ```svelte
 * <!-- Basic progress bar -->
 * <Progress value={60} />
 *
 * <!-- With custom max value -->
 * <Progress value={75} max={100} />
 *
 * <!-- Indeterminate progress (no value) -->
 * <Progress />
 *
 * <!-- Custom styling -->
 * <Progress
 *   value={progress}
 *   class="h-2"
 *   indicatorClass="bg-green-500"
 * />
 * ```
 */
interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'class'> {
    /**
     * Current progress value (0 to max).
     * If undefined, shows indeterminate state.
     */
    value?: number;
    /**
     * Maximum value for progress (default: 100).
     */
    max?: number;
    /**
     * Additional CSS classes for the container.
     */
    class?: string;
    /**
     * Additional CSS classes for the indicator (filled portion).
     */
    indicatorClass?: string;
}
declare const Progress: import("svelte").Component<ProgressProps, {}, "">;
type Progress = ReturnType<typeof Progress>;
export default Progress;
//# sourceMappingURL=Progress.svelte.d.ts.map