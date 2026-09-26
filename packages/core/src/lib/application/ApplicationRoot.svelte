<script lang="ts" generics="S, A, D, I, Routed extends boolean = false">
  import { onDestroy, setContext, untrack, type Snippet } from 'svelte';
  import { createApplication, type ApplicationOptions } from './create-application.js';
  import type { ApplicationDefinition } from './definition.js';
  import { getApplicationInternal, type ApplicationInstance } from './instance.svelte.js';
  import { applicationContextKey, type ApplicationContext } from './context.js';

  let { definition, options, children }: {
    definition: ApplicationDefinition<S, A, D, I, Routed>;
    options: ApplicationOptions<NoInfer<S>, NoInfer<D>, NoInfer<I>, NoInfer<Routed>>;
    children: Snippet<[ApplicationInstance<S, A>]>;
  } = $props();

  const captured = untrack(() => {
    const selectedDefinition = definition;
    const selectedOptions = options;
    return { definition: selectedDefinition, app: createApplication(selectedDefinition, selectedOptions) };
  });
  const { app } = captured;
  const { destroy } = getApplicationInternal(app);
  setContext<ApplicationContext>(applicationContextKey, { definition: captured.definition, app });

  $effect.pre(() => () => destroy());
  onDestroy(() => destroy());
  const guarded: Snippet<[ApplicationInstance<S, A>]> = (...args: Parameters<Snippet<[ApplicationInstance<S, A>]>>) => {
    try { return Reflect.apply(children, undefined, args); }
    catch (error) { destroy(); throw error; }
  };
</script>

{@render guarded(app)}
