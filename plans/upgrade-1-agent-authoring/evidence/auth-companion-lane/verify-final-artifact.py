import pathlib,tarfile,json,hashlib,base64,sys
root=pathlib.Path(__file__).resolve().parents[4]
a=pathlib.Path(sys.argv[1]); target=pathlib.Path(sys.argv[2]); data=a.read_bytes()
with tarfile.open(a) as tar:
 members=[m for m in tar.getmembers() if m.isfile()]
 names=[m.name for m in members]
 forbidden=[n for n in names if '/node_modules/' in n or '/.vite/' in n or '/.svelte-kit/' in n or n.startswith('package/consumer/dist/')]
 assert not forbidden, forbidden
 assert 'package/consumer/src/App.svelte' in names
 assert 'package/consumer/scripts/browser.mjs' in names
 assert 'package/consumer/scripts/ssr.mjs' in names
 mismatches=[]
 for m in members:
  p=root/'packages/auth'/m.name.removeprefix('package/')
  if m.name=='package/package.json':
   expected=json.loads(p.read_text())
   expected['devDependencies']['@composable-svelte/core']='0.13.0'
   expected['scripts'].pop('prepack',None)
   expected['scripts'].pop('prepublishOnly',None)
   assert json.loads(tar.extractfile(m).read())==expected,'Unexpected packed manifest transformation'
  elif not p.is_file() or p.read_bytes()!=tar.extractfile(m).read():mismatches.append(m.name)
 assert not mismatches,mismatches
fixtures=[]
for name,pin in [('auth-oauth-min','5.20.0'),('auth-oauth-current','5.55.3')]:
 p=pathlib.Path(sys.argv[3 if pin=='5.20.0' else 4]) if len(sys.argv)>4 else pathlib.Path('/private/tmp')/name
 lock=json.loads((p/'package-lock.json').read_text())['packages']
 installed=p/'node_modules/@composable-svelte/auth'
 assert not installed.is_symlink()
 assert not (p/'node_modules/@composable-svelte/core').is_symlink()
 coreArchive=p/'composable-svelte-core-0.13.0.tgz'
 coreBytes=coreArchive.read_bytes()
 assert hashlib.sha256(coreBytes).hexdigest()=='230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355'
 assert lock['node_modules/@composable-svelte/core']['integrity']=='sha512-'+base64.b64encode(hashlib.sha512(coreBytes).digest()).decode()
 assert lock['node_modules/@composable-svelte/auth']['integrity']=='sha512-'+base64.b64encode(hashlib.sha512(data).digest()).decode()
 assert lock['node_modules/svelte']['version']==pin
 with tarfile.open(a) as tar:
  for m in tar.getmembers():
   if not m.isfile():continue
   relative=m.name.removeprefix('package/')
   installedFile=installed/relative
   assert installedFile.is_file() and installedFile.read_bytes()==tar.extractfile(m).read(),str(installedFile)
   if relative.startswith('consumer/') and relative!='consumer/package.json':
    fixtureFile=p/relative.removeprefix('consumer/')
    assert fixtureFile.is_file() and fixtureFile.read_bytes()==installedFile.read_bytes(),str(fixtureFile)
 fixtures.append({'path':str(p),'svelte':pin,'authVersion':lock['node_modules/@composable-svelte/auth']['version'],'coreVersion':lock['node_modules/@composable-svelte/core']['version'],'authArchiveIntegrityMatches':True,'physicalDirectories':True,'coreIntegrity':lock['node_modules/@composable-svelte/core']['integrity']})
result={'archive':str(a),'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'packedFileCount':len(names),'forbiddenCacheOrDependencyFiles':forbidden,'allNonManifestPackedBytesMatchPackageTree':True,'packedManifestTransformation':'pnpm replaces workspace core devDependency with 0.13.0 and removes prepack/prepublishOnly; all other fields identical','fixtures':fixtures,'packedFiles':names}
target.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='packedFiles'},indent=2))
