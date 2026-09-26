import {parse} from '../../packages/architecture/node_modules/svelte/src/compiler/index.js';
const forms = [
  `{#each xs}<p/>{/each}`,
  `{#each xs, i}<p/>{/each}`,
  `{#each xs as x, i (x)}<p/>{/each}`,
  `{#each xs as {a, ...r}, i}<p/>{/each}`,
  `{#await p}{:then}<p/>{/await}`,
  `{#await p then}<p/>{/await}`,
  `{#await p}{:then v}{/await}`,
  `{#await p then v}{/await}`,
  `{#await p then v}{:catch e}{/await}`,
  `{#await p catch e}{/await}`,
  `{#await p}{:catch}{/await}`,
  `{#if 1}{@const a = 1, b = 2}{/if}`,
  `{#if 1}{@const a: any = 1}{/if}`,
  `{#each xs as x: any}<p/>{/each}`,
  `{#each (xs) as x}<p/>{/each}`,
  `{#each xs as x}{:else}<p/>{/each}`,
];
for (const f of forms) {
  const src = `<script lang="ts"></script>${f}`;
  try {
    const ast = parse(src, {modern: true});
    const walk = (n, out=[]) => { if (!n || typeof n !== 'object') return out; if (Array.isArray(n)) { n.forEach(c=>walk(c,out)); return out;} if (['EachBlock','AwaitBlock','ConstTag'].includes(n.type)) out.push(n); for (const k of ['fragment','nodes','body','consequent','then','pending','catch']) walk(n[k], out); return out; };
    const nodes = walk(ast.fragment);
    console.log(f.padEnd(42), JSON.stringify(nodes.map(n => n.type==='EachBlock' ? {t:'each', ctx: n.context && [n.context.type,n.context.start,n.context.end, src.slice(n.context.start,n.context.end)], idx: n.index, expr: n.expression && [n.expression.start,n.expression.end]}
      : n.type==='AwaitBlock' ? {t:'await', value: n.value && [n.value.type, src.slice(n.value.start,n.value.end)], err: n.error && src.slice(n.error.start,n.error.end), then: !!n.then, catch: !!n.catch, pending: !!n.pending}
      : {t:'const', decls: n.declaration.declarations.map(d => [src.slice(d.id.start,d.id.end), d.init && src.slice(d.init.start,d.init.end)])})));
  } catch (e) { console.log(f.padEnd(42), 'PARSE-ERR', e.code); }
}
