import {run} from '../probes/harness.mjs';
const sv = (tpl) => ({'App.svelte': `<script lang="ts">\n</script>\n${tpl}\n`});
run([['T1 fn-type destr default in param type', sv(`{#snippet s(cb: ({a = 1}: {a?: number}) => void)}<button onclick={() => cb({})}>x</button>{/snippet}\n{@render s(() => {})}`)]]);
