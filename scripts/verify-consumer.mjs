#!/usr/bin/env node
/** Build first. Installs real tarballs outside the workspace; never publishes. */
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,readdirSync,existsSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url));
const scratch=mkdtempSync(join(tmpdir(),'composable-consumer-'));
const packs=join(scratch,'packs'), unpacked=join(scratch,'unpacked'),app=join(scratch,'app');
mkdirSync(packs);mkdirSync(unpacked);
console.log(`Consumer verification: ${scratch}`);
const run=(cmd,args,cwd=app)=>execFileSync(cmd,args,{cwd,stdio:'inherit',env:{...process.env,TZ:'UTC'}});
const names=['core','auth','charts','chat','code','graphics','maps','media'];
const deps={};
for(const name of names){
 const dir=join(root,'packages',name);
 const manifest=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
 run('npm',['pack','--ignore-scripts','--pack-destination',packs,'--loglevel','error'],dir);
 const tar=join(packs,`composable-svelte-${name}-${manifest.version}.tgz`);
 deps[manifest.name]=`file:${tar}`;
 const out=join(unpacked,name);mkdirSync(out);
 run('tar',['-xzf',tar,'-C',out],root);
}
const pkg=name=>join(unpacked,name,'package');
// Prove the shipped starter works with core alone before satellite packages
// could accidentally satisfy an undeclared dependency.
const starter=join(scratch,'starter');
cpSync(join(pkg('core'),'consumer'),starter,{recursive:true});
const starterManifest=JSON.parse(readFileSync(join(starter,'package.json'),'utf8'));
starterManifest.dependencies['@composable-svelte/core']=deps['@composable-svelte/core'];
writeFileSync(join(starter,'package.json'),JSON.stringify(starterManifest,null,2));
run('npm',['install','--ignore-scripts','--no-audit','--no-fund'],starter);
run('npx',['playwright','install','chromium'],starter);
run('npm',['run','check'],starter);
run('npm',['test'],starter);
run('npm',['run','test:ssr'],starter);
run('npm',['run','test:browser'],starter);
console.log('Standalone core starter passed without satellite packages');
cpSync(join(pkg('core'),'consumer'),app,{recursive:true});
const manifest=JSON.parse(readFileSync(join(app,'package.json'),'utf8'));
manifest.dependencies={...manifest.dependencies,...deps};
manifest.devDependencies.tailwindcss3='npm:tailwindcss@3.4.17';
manifest.devDependencies.autoprefixer='10.4.21';
writeFileSync(join(app,'package.json'),JSON.stringify(manifest,null,2));
// Exact file inventory is a positive control: deleting markers cannot turn this green.
const required={core:['counter-store.ts','Core.svelte','navigation.test.ts','animation.test.ts'],auth:['stores.ts','Auth.svelte'],charts:['Chart.svelte','charts.test.ts'],chat:['Chat.svelte','chat.test.ts'],code:['Highlight.svelte','Editor.svelte','Canvas.svelte','code.test.ts'],graphics:['Scene.svelte','graphics.test.ts'],maps:['stores.ts','Map.svelte','custom.ts'],media:['Audio.svelte','Video.svelte','Voice.svelte','media.test.ts']};
for(const name of names){
 const documents = name === 'core'
  ? ['README.md', 'docs/core-concepts/testing.md', 'docs/animation/animated-navigation.md']
  : ['README.md'];
 const source=documents.map(file => readFileSync(join(pkg(name),file),'utf8')).join('\n');
 const files=new Map();
 for(const match of source.matchAll(/<!-- consumer-file: ([\w.-]+) -->\n```(?:typescript|ts|svelte)\n([\s\S]*?)\n```/g)){
  files.set(match[1],(files.get(match[1])??'')+match[2]+'\n');
 }
 assert.deepEqual([...files.keys()].sort(),required[name].sort(),`${name}: runnable README inventory changed`);
 for(const [file,body]of files){
  const dest=join(app,'readme-examples',name,file);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,body);
 }
 const m=JSON.parse(readFileSync(join(pkg(name),'package.json'),'utf8'));
 assert.match(m.repository.url,/github.com\/jonathanbelolo\/composable-svelte/);
 assert.match(m.homepage,/github.com\/jonathanbelolo\/composable-svelte/);
}
// Ensure guides and their relative links survive packaging. External links are
// checked separately by maintainers; this does not mistake a repo file for a shipped file.
let docs=0,links=0;
function checkDocs(dir){
 for(const entry of readdirSync(dir,{withFileTypes:true})){
  const file=join(dir,entry.name);
  if(entry.isDirectory()){if(['docs','dist','consumer'].includes(entry.name)||dir.includes('/docs')||dir.includes('/dist')||dir.includes('/consumer'))checkDocs(file);continue;}
  if(!file.endsWith('.md'))continue;
  docs++;
  for(const m of readFileSync(file,'utf8').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)){
   const link=m[1];assert.notEqual(link,'#',`${file}: placeholder documentation link`);if(/^(?:[a-z]+:|#)/i.test(link))continue;
   links++;assert.ok(existsSync(resolve(dirname(file),link.split('#')[0])),`${file}: unshipped link ${link}`);
  }
 }
}
for(const name of names)checkDocs(pkg(name));
assert.ok(docs>=34&&links>=20,`Documentation inventory too small: ${docs} docs, ${links} links`);
assert.ok(existsSync(join(pkg('core'),'docs/consumer.md')));
assert.ok(existsSync(join(pkg('auth'),'docs/http-contract.md')));
console.log(`${docs} packed documents, ${links} relative links, ${Object.values(required).flat().length} README/guide files verified`);
// Bundle the safe-to-mount README examples into the real production application.
const appFile=join(app,'src/App.svelte');
let source=readFileSync(appFile,'utf8');
const mounts=[['Chart','charts/Chart'],['Auth','auth/Auth'],['Highlight','code/Highlight'],['Editor','code/Editor'],['Chat','chat/Chat'],['Audio','media/Audio']];
source=source.replace('<script lang="ts">','<script lang="ts">\n'+mounts.map(([name,path])=>`import ${name} from '../readme-examples/${path}.svelte';`).join('\n'));
source+='\n<section aria-label="Package examples">'+mounts.map(([name])=>`<div data-testid="example-${name}"><${name}/></div>`).join('\n')+'</section>\n';
writeFileSync(appFile,source);
writeFileSync(join(app,'browser/packages.spec.ts'),`import {test,expect} from '@playwright/test';
test('installed satellite examples render and accept input',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/chat',route=>route.fulfill({status:200,contentType:'text/plain',body:'Hello from the test backend'}));
 await page.goto('/');
 for(const name of ['Chart','Auth','Highlight','Editor','Chat','Audio'])await expect(page.getByTestId('example-'+name)).toBeVisible();
 await expect(page.getByTestId('example-Chart').locator('svg').first()).toBeVisible();
 const editor=page.getByTestId('example-Editor').locator('.cm-content');
 await editor.fill('const answer = 42;');await expect(editor).toHaveText('const answer = 42;');
 await expect(page.getByTestId('example-Auth').getByLabel('Email',{exact:true})).toBeVisible();
 const chat=page.getByTestId('example-Chat');
 await chat.getByPlaceholder('Type your message...').fill('Hello');
 await chat.getByRole('button',{name:'Send message',exact:true}).click();
 await expect(chat.getByText('Hello from the test backend',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
`);

run('npm',['install','--ignore-scripts','--no-audit','--no-fund']);
run('npx',['playwright','install','chromium']);
// Check every typed public entry point in both common TypeScript resolvers.
const imports=[];
for(const name of names){
 const m=JSON.parse(readFileSync(join(pkg(name),'package.json'),'utf8'));
 for(const [entry,config] of Object.entries(m.exports)){
  if(typeof config==='object' && config.types){
   const id=imports.length;
   imports.push(`import type * as entry${id} from '${m.name}${entry==='.'?'':entry.slice(1)}'; export type Entry${id}=typeof entry${id};`);
  }
 }
}
assert.ok(imports.length>=48,'Typed entry point inventory shrank');
writeFileSync(join(app,'readme-examples/exports.ts'),imports.join('\n'));
run('npm',['run','check']);
run('npx',['tsc','--noEmit','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--lib','ESNext,DOM,DOM.Iterable','--strict','--skipLibCheck','readme-examples/exports.ts']);
console.log(`${imports.length} typed entry points passed Bundler and NodeNext resolution`);
run('npm',['test']);
run('npm',['run','test:ssr']);
run('npm',['run','test:browser']);
// Positive controls intentionally restore the audited defects in the installed
// consumer. Each check must fail for the expected reason, then restore the file.
function rejects(label,file,change,command,args,pattern){
 const original=readFileSync(file,'utf8'),mutated=change(original);
 assert.notEqual(mutated,original,`${label}: mutation did not apply`);
 writeFileSync(file,mutated);
 try {
  let result;
  try {execFileSync(command,args,{cwd:app,encoding:'utf8',stdio:'pipe',env:{...process.env,TZ:'UTC'}});}
  catch(error){result=String(error.stdout)+String(error.stderr);}
  assert.ok(result,`${label}: invalid consumer unexpectedly passed`);
  assert.match(result,pattern,`${label}: failed for an unrelated reason`);
  console.log(`Positive control rejected: ${label}`);
 } finally {writeFileSync(file,original);}
}
const example=path=>join(app,'readme-examples',path);
rejects('missing core store export',example('core/counter-store.ts'),s=>s.replace('export const store','const store'),'npm',['run','check'],/declares 'store' locally, but it is not exported/);
rejects('obsolete editor option',example('code/Editor.svelte'),s=>s.replace('value:', 'code:'),'npm',['run','check'],/does not exist in type/);
rejects('obsolete map provider',example('maps/stores.ts'),s=>s.replace('createInitialMapState({','createInitialMapState({provider: \'maplibre\','),'npm',['run','check'],/does not exist in type/);
rejects('wrong effect action',example('code/code.test.ts'),s=>s.replace("type: 'highlighted'","type: 'highlightCompleted'"),'npm',['test','--','readme-examples/code/code.test.ts'],/highlightCompleted/);
rejects('node canvas array state',example('code/Canvas.svelte'),s=>s.replace(/nodes: \{[\s\S]*?\n      \},/,'nodes: [],'),'npm',['run','check'],/not assignable to type/);
rejects('missing node action lifting',example('code/Canvas.svelte'),s=>s.replace(' liftAction={(action) => action}',''),'npm',['run','check'],/liftAction/);
rejects('obsolete audio factory option',example('media/media.test.ts'),s=>s.replace('createInitialAudioPlayerState()','createInitialAudioPlayerState({tracks: []})'),'npm',['run','check'],/does not exist in type/);
rejects('double-wrapped dismiss',example('core/navigation.test.ts'),s=>s.replace(
 /dismiss: createDismissDependency<ParentAction>\([\s\S]*?\n      \)/,
 "dismiss: () => Effect.run(async dispatch => dispatch({ type: 'destination', action: { type: 'dismiss' } }))"
),'npm',['test','--','readme-examples/core/navigation.test.ts'],/next received action was.*presented/);
rejects('missing animation guard',example('core/animation.test.ts'),s=>s.replace(
 "if (state.presentation.status !== 'presented') return [state, Effect.none()];", ''
),'npm',['test','--','readme-examples/core/animation.test.ts'],/expected 'dismissing' to be 'idle'/);
rejects('missing timeout fallback',example('core/animation.test.ts'),s=>s.replace(
 "deps.completeAutomatically ? 'presentationCompleted' : 'presentationTimeout'", "'presentationCompleted'"
),'npm',['test','--','readme-examples/core/animation.test.ts'],/Expected to receive.*presentationTimeout/);
const guide=join(pkg('core'),'docs/consumer.md');
renameSync(guide,guide+'.hidden');
try {assert.throws(()=>checkDocs(pkg('core')),/unshipped link/);console.log('Positive control rejected: missing packaged guide');}
finally{renameSync(guide+'.hidden',guide);}
const index=join(pkg('core'),'docs/README.md');
const indexText=readFileSync(index,'utf8');
writeFileSync(index,indexText+'\n[Missing deployment guide](#)\n');
try {assert.throws(()=>checkDocs(pkg('core')),/placeholder documentation link/);console.log('Positive control rejected: placeholder documentation link');}
finally {writeFileSync(index,indexText);}
// Exercise the documented Tailwind 3 path using the same browser assertions.
const viteFile=join(app,'vite.config.ts'),cssFile=join(app,'src/app.css');
const vite4=readFileSync(viteFile,'utf8'),css4=readFileSync(cssFile,'utf8');
try {
 writeFileSync(viteFile,`import {defineConfig} from 'vite';\nimport {svelte} from '@sveltejs/vite-plugin-svelte';\nimport tailwind from 'tailwindcss3';\nimport autoprefixer from 'autoprefixer';\nimport preset,{contentGlob} from '@composable-svelte/core/tailwind-preset';\nexport default defineConfig({plugins:[svelte()],css:{postcss:{plugins:[tailwind({presets:[preset],content:['./src/**/*.{html,ts,svelte}','./readme-examples/**/*.svelte',contentGlob]}),autoprefixer()]}}});\n`);
 writeFileSync(cssFile,"@import '@composable-svelte/core/styles/globals.css';\nbody {margin:2rem;}\n");
 run('npm',['run','test:browser']);
 console.log('Tailwind 3 production browser check passed');
} finally {writeFileSync(viteFile,vite4);writeFileSync(cssFile,css4);}
console.log(`Consumer verification passed. Reproduction files retained at ${app}`);
