#!/bin/zsh
set -u
SRC=/private/tmp/composable-final-checker/packages/architecture
cd /private/tmp/composable-final-checker/opus-final-review/mutants
for m in M1 M2 M3 M4 M5 M6 M7 M8 M9 M10 M11; do
  rm -rf $m; mkdir -p $m; cp -R $SRC/src $m/src; ln -s $SRC/node_modules $m/node_modules
  case $m in
    M1) perl -0pi -e 's/\(ts\.isTypeNode\(node\) && !isInstantiationExpression\(node\)\)/ts.isTypeNode(node)/' $m/src/semantic-context.mjs ;;
    M2) perl -0pi -e 's/const key = `\$\{nodeId\(node\)\}:\$\{kind\}`;/const key = node;/' $m/src/semantic-flow.mjs ;;
    M4) perl -0pi -e 's/\(ts\.isTypeNode\(parent\) && !isInstantiationExpression\(parent\)\)/ts.isTypeNode(parent)/' $m/src/symbols.mjs ;;
    M5) perl -0pi -e "s/if \(unit\.kind === 'binding' && \(ts\.isVariableDeclaration/if (false && (ts.isVariableDeclaration/" $m/src/semantic-context.mjs ;;
    M6) perl -0pi -e "s/if \(unit\.kind === 'binding' && ts\.isComputedPropertyName/if (false && ts.isComputedPropertyName/" $m/src/semantic-context.mjs ;;
    M7) perl -0pi -e "s/if \(marker\.kind === 'each-block' && marker\.context\)/if (false)/" $m/src/semantic-flow.mjs ;;
    M8) perl -0pi -e "s/else if \(marker\.kind === 'const-tag'\)/else if (false)/" $m/src/semantic-flow.mjs ;;
    M9) perl -0pi -e "s/else if \(marker\.kind === 'await-block' && marker\.value\)/else if (false)/" $m/src/semantic-flow.mjs ;;
    M10) perl -0pi -e "s/\{ templateBindingError\(module, marker, 'Template binding has no inspectable source value\.'\); return; \}/{ return; }/" $m/src/semantic-flow.mjs ;;
    M11) perl -0pi -e 's/unit\.start === node\.start && unit\.end === node\.end/unit.start <= node.start \&\& unit.end >= node.end/' $m/src/semantic-flow.mjs ;;
    M3) perl -0pi -e "s/unit\.kind === 'template' \?/false ?/" $m/src/semantic-flow.mjs ;;
  esac
  diff -r $SRC/src $m/src >/dev/null && { echo "$m NOT APPLIED"; continue; }
  out=$(cd $m && node --test src/instantiation-expression.test.mjs src/getter-promise-compat.test.mjs src/template-binding-default.test.mjs src/template-binding-values.test.mjs 2>&1 | grep -E "ℹ (pass|fail)" | tr '\n' ' ')
  echo "$m: $out"
done
