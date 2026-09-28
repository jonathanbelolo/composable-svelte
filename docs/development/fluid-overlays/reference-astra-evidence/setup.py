import subprocess, pathlib, shutil, json, hashlib, os
root=pathlib.Path.cwd(); dst=pathlib.Path('/private/tmp/overlay-reference-astra-20260928'); dst.mkdir(exist_ok=True)
p=subprocess.Popen(['git','archive','2e07f650c1421c25f6b29d2db9c0cc885ea891ed'],stdout=subprocess.PIPE)
subprocess.run(['tar','-x','-C',str(dst)],stdin=p.stdout,check=True);p.wait()
snap=root/'docs/development/fluid-overlays/reference-opus-correction-snapshot'
manifest=json.loads((snap/'manifest.json').read_text())
assert hashlib.sha256((snap/'manifest.json').read_bytes()).hexdigest()=='86b79450f99410fdc23ac4c8d94d1408640b200a45a628536fa0cf3956a28ce0'
for rel,h in manifest.items():
 f=snap/rel; assert hashlib.sha256(f.read_bytes()).hexdigest()==h,rel
 out=dst/rel;out.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,out)
shutil.copytree(snap/'core-dist',dst/'packages/core/dist',dirs_exist_ok=True)
for rel in ['node_modules','packages/core/node_modules','packages/graphics/node_modules','examples/fluid-motion-reference/node_modules']:
 src=root/rel; target=dst/rel
 target.mkdir(parents=True,exist_ok=True)
 for f in src.iterdir():
  if f.name in ['.vite','.vite-temp']:continue
  if f.name=='@composable-svelte':
   (target/f.name).mkdir(exist_ok=True)
   for g in f.iterdir():
    r=dst/'packages'/g.name
    if not (r/'dist').exists() and (root/'packages'/g.name/'dist').exists():shutil.copytree(root/'packages'/g.name/'dist',r/'dist',dirs_exist_ok=True)
    if not (target/f.name/g.name).exists():(target/f.name/g.name).symlink_to(r,target_is_directory=True)
  elif not (target/f.name).exists():(target/f.name).symlink_to(f.resolve(),target_is_directory=f.is_dir())
print(dst)
print('manifest verified',len(manifest),'files')
print('run.js',hashlib.sha256((dst/'packages/core/dist/application/motion/run.js').read_bytes()).hexdigest())
