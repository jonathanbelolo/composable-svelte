/** Pure conservative decisions shared by the mutation runner and its tests. */
export function isRedBaseline({ exit, failed }) {
  return exit !== 0 || failed === null || failed.length > 0;
}

export function mutationVerdict({ exit, failed }, expected) {
  if (failed === null) return { verdict: 'ERROR', detail: `missing or malformed report (exit ${exit}); no verdict is possible` };
  if (failed.some(name => name.includes(expected))) {
    const others = failed.filter(name => !name.includes(expected));
    return { verdict: 'KILLED', detail: others.length ? `also failed: ${others.join('; ')}` : '' };
  }
  if (exit !== 0 || failed.length > 0) return {
    verdict: 'SUSPECT',
    detail: `the suite failed but not the test that guards this line (${JSON.stringify(expected)}); failed: ${failed.join('; ') || `exit ${exit}, no failed test`}`
  };
  return { verdict: 'SURVIVED', detail: '' };
}

export function strictExitCode(rows, strict) {
  return strict && rows.some(row => row.verdict !== 'KILLED') ? 1 : 0;
}
