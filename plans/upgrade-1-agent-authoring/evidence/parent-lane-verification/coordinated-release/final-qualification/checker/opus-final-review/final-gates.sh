#!/bin/zsh
# Opus final review: re-run affected installed gates on the corrected, repacked checker archive.
# Reuses the finalizer's orchestration scripts unchanged (hashes recorded); only the checker archive changes.
set -u
R=/private/tmp/composable-final-checker
OR=$R/opus-final-review
PP=$R/profile-phase
MANIFEST=/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json
EV=$OR/evidence
mkdir -p $EV
cd $R
shasum -a 256 $PP/qualify-profiles-v3.mjs $PP/consumer-verify.mjs $PP/author-app-compatibility-v2.mjs $PP/auth-derivative/auth-controls.mjs \
  $R/evidence/opus-starter-review-NOT-FINAL/controls.mjs $R/packages/architecture/test/installed-bin-smoke.mjs $MANIFEST > $EV/tooling.sha256

# ---- A. suite, single pack, archive inspection -------------------------------------------------------------------
(cd packages/architecture && npm test) > $EV/suite.log 2>&1; echo "suite exit=$?" | tee $EV/exits.txt
mkdir -p $OR/final-archive
rm -f $OR/final-archive/*.tgz
(cd packages/architecture && npm pack --json --pack-destination $OR/final-archive) > $OR/final-archive/npm-pack.json 2> $OR/final-archive/npm-pack.stderr
A=$OR/final-archive/composable-svelte-architecture-0.13.1.tgz
SHA=$(shasum -a 256 $A | cut -d' ' -f1)
SRI="sha512-$(openssl dgst -sha512 -binary $A | openssl base64 -A)"
echo "$SHA  $A" > $OR/final-archive/sha256.txt
echo "$SRI" > $OR/final-archive/sri.txt
(cd packages/architecture && node test/inspect-archive.mjs $A) > $OR/final-archive/inspect.json 2> $OR/final-archive/inspect.stderr; echo "inspect exit=$?" | tee -a $EV/exits.txt
echo "archive $SHA $SRI" | tee -a $EV/exits.txt

# ---- B. profile qualification (all 9 selectors' consumers, originals, controls, bundled dev feedback) --------------
(cd $PP && node qualify-profiles-v3.mjs --phase opus-final --evidence $EV/profiles --checker $A --checker-sha256 $SHA \
  --policies $R/packages/architecture/policies --manifest $MANIFEST --bundled-selectors) > $EV/profiles-run.log 2> $EV/profiles-run.stderr
echo "profiles exit=$?" | tee -a $EV/exits.txt

# ---- C. real shipped starter on R6 core + this checker -------------------------------------------------------------
E=$EV/starter; mkdir -p $E
W=$(mktemp -d "$TMPDIR/opus-final-starter-XXXX"); W=$(cd $W && pwd -P); echo $W > $E/scratch.txt
P=$W/starter; mkdir -p $P $W/arch
CORE=/private/tmp/companion-runtime-release/archives-r6/composable-svelte-core-0.13.1.tgz
cp $CORE $A $W/arch/; shasum -a 256 $W/arch/*.tgz | tee $E/archives.sha256
tar xzf $W/arch/composable-svelte-core-0.13.1.tgz -C $P --strip-components=2 package/consumer
python3 -c "import json;p=json.load(open('$P/package.json'));print(p['dependencies'],p['devDependencies']['@composable-svelte/architecture'],p['scripts']['check:architecture'])" | tee $E/shipped-pins.txt
cp $P/package.json $W/consumer-package.json.orig
(cd $P && node -e "
const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));
p.dependencies['@composable-svelte/core']='file:$W/arch/composable-svelte-core-0.13.1.tgz';
p.devDependencies['@composable-svelte/architecture']='file:$W/arch/composable-svelte-architecture-0.13.1.tgz';
fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')" && npm install --ignore-scripts --no-audit --no-fund > $E/npm-install.log 2>&1; cp $W/consumer-package.json.orig package.json; rm -f package-lock.json)
cmp $P/package.json $W/consumer-package.json.orig && echo "package.json restored to shipped bytes" | tee $E/installed-verification.txt
for pair in "core:composable-svelte-core-0.13.1.tgz" "architecture:composable-svelte-architecture-0.13.1.tgz"; do
  n=${pair%%:*}; X=$W/x-$n; mkdir -p $X; tar xzf $W/arch/${pair#*:} -C $X
  mism=$(cd $X/package && find . -type f | while read f; do cmp -s "$f" "$P/node_modules/@composable-svelte/$n/$f" || echo x; done | wc -l | tr -d ' ')
  echo "$n archiveFiles=$(cd $X/package && find . -type f | wc -l | tr -d ' ') installedFiles=$(cd $P/node_modules/@composable-svelte/$n && find . -type f | wc -l | tr -d ' ') mismatches=$mism symlink=$(test -L $P/node_modules/@composable-svelte/$n && echo yes || echo no)" | tee -a $E/installed-verification.txt
done
node -p "['svelte','typescript','vite','vitest','svelte-check','@playwright/test'].map(n=>n+'@'+require('$P/node_modules/'+n+'/package.json').version).join(' ')" | tee -a $E/installed-verification.txt
node -p "'checker parser deps: typescript@'+require('$P/node_modules/@composable-svelte/architecture/node_modules/typescript/package.json').version" >> $E/installed-verification.txt 2>/dev/null || true
for s in check test test:ssr check:architecture test:browser; do (cd $P && npm run $s > "$E/starter-$s.stdout.log" 2> "$E/starter-$s.stderr.log"); echo "$s exit=$?" | tee -a $E/starter-exits.txt; done
(cd $W && mkdir -p policies records && cp /private/tmp/composable-final-qualification/candidate-starter-policy.json policies/candidate.json \
  && cp $R/packages/architecture/policies/starter.json policies/proposed-bundled-bytes.json \
  && cp /private/tmp/composable-final-qualification/repo/packages/architecture/policies/starter.json policies/prior-bundled-0.13.0.json \
  && for v in core-0.13.2 core-0.13.0 unapproved-import; do cp -Rc starter p-$v; done \
  && node -e "
const fs=require('fs');for(const [d,v] of [['p-core-0.13.2','0.13.2'],['p-core-0.13.0','0.13.0']]){const f=d+'/node_modules/@composable-svelte/core/package.json';const p=JSON.parse(fs.readFileSync(f));p.version=v;fs.writeFileSync(f,JSON.stringify(p,null,2));}" \
  && printf "import 'clsx';\n" | cat - starter/src/main.ts > p-unapproved-import/src/main.ts \
  && cp $R/evidence/opus-starter-review-NOT-FINAL/controls.mjs . && node controls.mjs $W > $E/starter-controls.ndjson); echo "starter controls exit=$?" | tee -a $EV/exits.txt
node $R/packages/architecture/test/installed-bin-smoke.mjs ${W#/private}/starter > $E/installed-bin-smoke.log 2>&1; echo "smoke exit=$?" | tee -a $EV/exits.txt

# ---- D. Auth-only derivative controls (exact registered auth bytes supplied externally) ---------------------------
DW=$(cat $PP/auth-derivative/final-derivation-scratch.txt); H=$DW/checker-host-opus-final; rm -rf $H; mkdir -p $H
echo "{\"name\":\"checker-host\",\"private\":true,\"devDependencies\":{\"@composable-svelte/architecture\":\"file:$A\"}}" > $H/package.json
(cd $H && npm install --ignore-scripts --no-audit --no-fund --no-package-lock > /dev/null 2>&1)
T=$(mktemp -d); tar xzf $A -C $T
echo "checker host mismatches: $(cd $T/package && find . -type f | while read f; do cmp -s "$f" "$H/node_modules/@composable-svelte/architecture/$f" || echo x; done | wc -l | tr -d ' ') files=$(cd $H/node_modules/@composable-svelte/architecture && find . -type f | wc -l | tr -d ' ')" | tee $EV/auth-checker-host.txt
E=$EV/auth-derivative; mkdir -p $E; BIN=$H/node_modules/@composable-svelte/architecture/bin/composable-svelte-architecture.mjs
node $PP/auth-derivative/auth-controls.mjs $BIN $DW/derived-installed $DW/app-b-original-installed $R/packages/architecture/policies/auth.json \
  $PP/P1-policies/external-appb/app-b-auth-charts.json $E "OPUS FINAL GATE: installed corrected checker $SHA (auth registered); exact registered auth bytes supplied externally; cleared R6 Core/Auth; derivative of FINAL App-B snapshot 2f289af3" > $E/run.log 2>&1
echo "auth controls exit=$?" | tee -a $EV/exits.txt
for sel in auth starter; do node $BIN --mode analysis-only --project $DW/derived-installed --policy bundled:$sel --expected-core-version 0.13.1 > $E/bundled-$sel-on-derivative.json 2>/dev/null; echo "bundled:$sel on derivative exit=$?" | tee -a $EV/exits.txt; done
node $BIN --mode qualification --project $DW/derived-installed --policy bundled:auth --expected-core-version 0.13.1 > /dev/null 2>&1; echo "bundled:auth qualification exit=$? (expect 22)" | tee -a $EV/exits.txt

# ---- E. author-app compatibility copies (read-only originals; app gate proper is separate) ------------------------
(cd $PP && node author-app-compatibility-v2.mjs --evidence $EV/author-apps --checker $A --checker-sha256 $SHA \
  --ccm $R/packages/architecture/policies/chat-code-media.json --appb $PP/P1-policies/external-appb/app-b-auth-charts.json --manifest $MANIFEST) > $EV/author-apps.log 2>&1
echo "author-apps exit=$?" | tee -a $EV/exits.txt
echo DONE | tee -a $EV/exits.txt
