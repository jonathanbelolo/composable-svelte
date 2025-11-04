<script lang="ts">
  import { cn } from '../../../utils.js';

  interface Props {
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
    class?: string;
    children?: import('svelte').Snippet;
  }

  let {
    variant = 'default',
    class: className,
    children,
    ...restProps
  }: Props = $props();

  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/80',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    success: 'bg-green-500 text-white hover:bg-green-600',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600'
  };
</script>

<div
  class={cn(
    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
    variantClasses[variant],
    className
  )}
  {...restProps}
>
  {#if children}
    {@render children()}
  {/if}
</div>
