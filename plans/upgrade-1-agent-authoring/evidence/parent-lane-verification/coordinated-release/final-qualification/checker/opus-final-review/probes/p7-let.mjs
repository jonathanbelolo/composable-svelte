import {run} from './harness.mjs';
const child = {'Child.svelte': `<slot item={[]} />\n`};
run([
  ['D8 let array default authority', {'App.svelte': `<script>\nimport Child from './Child.svelte';\n</script>\n<Child let:item={[f = window.location]}><button on:click={() => { f.href = '/x'; }}>x</button></Child>\n`, ...child}],
  ['D8c let array no default', {'App.svelte': `<script>\nimport Child from './Child.svelte';\n</script>\n<Child let:item={[f]}><button on:click={() => { f.href = '/x'; }}>x</button></Child>\n`, ...child}],
]);
