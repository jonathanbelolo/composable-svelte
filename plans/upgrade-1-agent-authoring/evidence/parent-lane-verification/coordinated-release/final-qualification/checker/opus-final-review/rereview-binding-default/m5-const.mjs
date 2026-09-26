import {run} from './m5-harness.mjs';
run([['M5 @const default', {'App.svelte': `<script lang="ts">\nconst obj: any = {};\n</script>\n{#if true}{@const {f = window.location} = obj}<button onclick={() => { (f as any).href = '/x'; }}>x</button>{/if}\n`}]]);
