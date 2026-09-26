import {run} from './harness.mjs';
const sv = (tpl) => ({'App.svelte': `<script lang="ts">\nconst k = 'a';\nconst rows = [{a: 1}];\n</script>\n${tpl}\n`});
run([
  ['T1 snippet param type with computed name', sv(`{#snippet s(x: {[Symbol.iterator]: () => any; ['a']: number})}<p>{x.a}</p>{/snippet}\n{@render s({a: 1} as any)}`)],
  ['T2 each literal string key', sv(`{#each rows as {'a': v}}<p>{v}</p>{/each}`)],
  ['T3 each computed literal key (still refused)', sv(`{#each rows as {['a']: v}}<p>{v}</p>{/each}`)],
]);
