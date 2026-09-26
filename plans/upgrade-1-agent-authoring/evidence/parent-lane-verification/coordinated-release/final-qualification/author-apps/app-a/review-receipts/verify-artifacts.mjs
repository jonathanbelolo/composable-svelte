import fs from 'node:fs'; import crypto from 'node:crypto'; import path from 'node:path';
const root='/private/tmp/composable-final-authoring';
const sha=(p)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const iv=JSON.parse(fs.readFileSync(root+'/APP-A-INSTALL-VERIFICATION.json'));
const man=JSON.parse(fs.readFileSync(root+'/APP-A-RUNTIME-MANIFEST.json'));
let bad=0;
for (const p of man.packages){ const h=sha(p.path); const ok=h===p.sha256; if(!ok)bad++; console.log(`archive ${p.filename} sha256=${h} ${ok?'MATCH':'MISMATCH'} bytes=${fs.statSync(p.path).size}/${p.bytes}`);}
for (const p of iv.packages){ const dir=path.join(root,'app-a/node_modules',p.name); let n=0,m=0; const expected=new Set(Object.keys(p.installedFiles));
 for (const [f,h] of Object.entries(p.installedFiles)){ n++; const fp=path.join(dir,f); if(!fs.existsSync(fp)||sha(fp)!==h){m++; console.log('  MISMATCH',p.name,f);} }
 // extra files
 const walk=(d)=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?(e.name==='node_modules'?[]:walk(path.join(d,e.name))):[path.join(d,e.name)]);
 const extra=walk(dir).map(f=>path.relative(dir,f)).filter(f=>!expected.has(f));
 const pkg=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));
 console.log(`installed ${p.name}@${pkg.version} files=${n} mismatched=${m} extraFiles=${extra.length} ${extra.slice(0,5).join(',')}`); bad+=m+extra.length; }
const pre=JSON.parse(fs.readFileSync(root+'/APP-A-PRE-OPUS-HASHES.json'));
let changed=[]; for(const [f,h] of Object.entries(pre)){ const fp=path.join(root,'app-a',f); if(!fs.existsSync(fp)||sha(fp)!==h) changed.push(f);} console.log('app files changed vs PRE-OPUS snapshot:',changed.length?changed:'none');
console.log(Object.keys(iv).filter(k=>k!=='packages').map(k=>k+'='+JSON.stringify(iv[k]).slice(0,300)).join('\n'));
console.log(bad?'RESULT: MISMATCH':'RESULT: ALL MATCH');
