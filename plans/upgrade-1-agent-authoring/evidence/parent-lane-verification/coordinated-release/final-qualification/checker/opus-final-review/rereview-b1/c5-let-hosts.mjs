import {run} from '../probes/harness.mjs';
const L = `(window.location.href = '/x')`;
const child = {'Child.svelte': `<script>export let item = {};</script>\n<slot name="a" {item} />\n`};
const sv = (tpl) => ({'App.svelte': `<script>\nimport Child from './Child.svelte';\n</script>\n${tpl}\n`, ...child});
run([
  ['E1 svelte:fragment let computed', sv(`<Child><svelte:fragment slot="a" let:item={{[${L}]: f}}><p>{f}</p></svelte:fragment></Child>`)],
  ['E2 div slot let computed', sv(`<Child><div slot="a" let:item={{[${L}]: f}}><p>{f}</p></div></Child>`)],
  ['E3 svelte:component let computed', sv(`<svelte:component this={Child} let:item={{[${L}]: f}}><p>{f}</p></svelte:component>`)],
]);
