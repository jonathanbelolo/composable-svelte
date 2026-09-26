import { defineConfig, type Plugin } from 'vitest/config';
import { compile, compileModule } from 'svelte/compiler';
// Compile server components and rune modules directly for Vite 6 Node tests.
const components: Plugin = { name:'counter-server-components', enforce:'pre', transform(code,id) {
 const filename=id.split('?')[0]!; if (!filename.endsWith('.svelte')) return null;
 const result=compile(code,{filename,generate:'server'});return {code:result.js.code,map:result.js.map};
}};
const runes: Plugin = { name:'counter-server-runes', enforce:'post', transform(code,id) {
 const filename=id.split('?')[0]!;if (!/\.svelte\.(ts|js)$/.test(filename)) return null;
 const result=compileModule(code,{filename,generate:'server'});return {code:result.js.code,map:result.js.map};
}};
export default defineConfig({plugins:[components,runes],test:{environment:'node',include:['tests/**/*.test.ts']}});
