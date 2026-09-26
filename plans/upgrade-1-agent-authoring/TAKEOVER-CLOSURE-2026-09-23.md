# Recovered task closure — 2026-09-23

The corrective six-author Upgrade 1 app-building evaluation is finished. Four authors qualified initially; three completed both initial and withheld-change qualification. No author or qualification run remains pending.

| Run | Final outcome |
| --- | --- |
| A1 | End-to-end pass after one permitted initial repair; all nine change gates pass |
| A2 | Initial pass; withheld author rejected by frozen edit protocol |
| A3 | Initial author rejected by frozen edit protocol |
| B1 | End-to-end pass without repair; all nine change gates pass |
| B2 | End-to-end pass without repair; all nine change gates pass |
| B3 | Nonpass caused by frozen checker false positive |

A2/A3’s edit-precondition rejections do not establish app functional failures. B3’s result remains nonpass even though a separate corrected-checker diagnostic is clean. The earlier cohort’s four-of-six result is separate and cannot be combined with this cohort.

The architecture checker now distinguishes capturing a callable from invoking it; 503 package tests and 49 independent adversarial checks passed. Prospective broker/controller v2 distinguishes verified no-write edit-precondition errors from boundary denials; its 58 integrated tests passed. Integration followed completion of every original-controller author phase. Neither correction retroactively changes this cohort’s frozen outcomes.

The [final scoreboard and evidence index](evidence/corrective-cohort-final-scoreboard-v1/SCOREBOARD.md) bind selected durable receipts and count reports. Full evidence graphs remain at their recorded source paths. Motion qualification covers the explicitly measured cases; it is not whole-application qualification. The corrected architecture archive received a separate extracted-file diagnostic, not successful npm-install qualification.

**Release remains blocked by the unmet six-of-six gate.** No package was published, no new cohort was launched, and the broader Upgrade 1 specification is not declared complete. The original takeover handoff and historical results are preserved.
