#!/bin/zsh
set -u
SRC=/private/tmp/composable-final-checker/packages/architecture
cd /private/tmp/composable-final-checker/opus-final-review/mutants
for m in M1 M2 M3 M4 M5; do
  rm -rf $m; mkdir -p $m; cp -R $SRC/src $m/src; ln -s $SRC/node_modules $m/node_modules
  case $m in
    M1) perl -0pi -e 's/\(ts\.isTypeNode\(node\) && !isInstantiationExpression\(node\)\)/ts.isTypeNode(node)/' $m/src/semantic-context.mjs ;;
    M2) perl -0pi -e 's/const key = `\$\{nodeId\(node\)\}:\$\{kind\}`;/const key = node;/' $m/src/semantic-flow.mjs ;;
    M4) perl -0pi -e 's/\(ts\.isTypeNode\(parent\) && !isInstantiationExpression\(parent\)\)/ts.isTypeNode(parent)/' $m/src/symbols.mjs ;;
    M5) perl -0pi -e "s/if \(unit\.kind === 'binding' && \(ts\.isVariableDeclaration/if (false && (ts.isVariableDeclaration/" $m/src/semantic-context.mjs ;;
    M3) perl -0pi -e "s/unit\.kind === 'template' \?/false ?/" $m/src/semantic-flow.mjs ;;
  esac
  diff -r $SRC/src $m/src >/dev/null && { echo "$m NOT APPLIED"; continue; }
  out=$(cd $m && node --test src/instantiation-expression.test.mjs src/getter-promise-compat.test.mjs src/template-binding-default.test.mjs 2>&1 | grep -E "ℹ (pass|fail)" | tr '\n' ' ')
  echo "$m: $out"
done
