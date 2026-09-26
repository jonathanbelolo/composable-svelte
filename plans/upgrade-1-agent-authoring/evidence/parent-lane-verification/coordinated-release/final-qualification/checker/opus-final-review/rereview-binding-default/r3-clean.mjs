import {run} from '../probes/harness.mjs';
const sv = (script, tpl) => ({'App.svelte': `<script lang="ts">\n${script}\n</script>\n${tpl}\n`});
const rows = `type Row = {id: number, name: string, tags: string[]}; const rows: Row[] = [{id: 1, name: 'a', tags: []}];`;
run([
  ['N1 keyed each', sv(rows, `{#each rows as item (item.id)}<p>{item.name}</p>{/each}`)],
  ['N2 each index + key', sv(rows, `{#each rows as item, i (item.id)}<p>{i}{item.name}</p>{/each}`)],
  ['N3 each no context', sv(rows, `{#each rows, i}<p>{i}</p>{/each}`)],
  ['N4 each array rest', sv(rows, `{#each [[1,2,3]] as [a, ...rest]}<p>{a}{rest.length}</p>{/each}`)],
  ['N5 each obj rest renamed', sv(rows, `{#each rows as {id: key, ...rest} (key)}<p>{rest.name}</p>{/each}`)],
  ['N6 snippet fn type', sv(``, `{#snippet s(cb: (x?: number) => void, o: {a: string; b?: number})}<button onclick={() => cb()}>{o.a}</button>{/snippet}\n{@render s(() => {}, {a: 'x'})}`)],
  ['N7 snippet conditional/generic type', sv(`type Box<T = string> = {v: T};`, `{#snippet s(b: Box, c: Box<number> extends {v: infer U} ? U : never, d: Array<Record<string, Box<string>>>)}<p>{b.v}{c}{d.length}</p>{/snippet}\n{@render s({v: 'a'}, 1 as any, [])}`)],
  ['N8 snippet destr typed', sv(rows, `{#snippet s({id, name}: Row, [first]: string[])}<p>{id}{name}{first}</p>{/snippet}\n{@render s(rows[0], ['a'])}`)],
  ['N9 snippet typed fn with destr type param', sv(``, `{#snippet s(cb: ({a}: {a: number}) => void)}<button onclick={() => cb({a: 1})}>x</button>{/snippet}\n{@render s(() => {})}`)],
  ['N10 @const typed generic', sv(rows, `{#each rows as r}{@const t: Array<string> = r.tags}{@const {id, ...o} = r}<p>{t.length}{id}{o.name}</p>{/each}`)],
  ['N11 then/catch plain', sv(`const q = Promise.resolve({n: 1});`, `{#await q then {n}}<p>{n}</p>{:catch e}<p>{String(e)}</p>{/await}`)],
  ['N12 each ternary key', sv(rows, `{#each rows as item (item.id === 1 ? 'a' : item.name)}<p>{item.name}</p>{/each}`)],
  ['N13 snippet type literal w/ fn default-looking', sv(``, `{#snippet s(o: {f: (a: number, b?: string) => number; g: new () => object})}<p>{o.f(1)}</p>{/snippet}\n{@render s({f: (a) => a, g: Object as any})}`)],
]);
