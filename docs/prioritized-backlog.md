# Prioritized implementation backlog

Updated 2026-09-26. Numbers match the product owner’s list. Implemented means code exists on the feature branch and needs PR review; it is not full v1 acceptance. Update this file and implementation-status.md whenever an item advances.

| #   | Status            | Evidence / next step                                                                                                    |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Done              | Job-scoped read permissions; PR #4 passed and merged.                                                                   |
| 2   | Done              | Gitleaks SHA PR #4 passed and merged.                                                                                   |
| 3   | Done              | PRs #1/#2/#3 individually reviewed and passed; all merged; no Node 20 warning in final #3 run.                          |
| 4   | Implemented       | Revised private spec copy and public spec amendments use RunHarbor naming and paths.                                    |
| 5   | Implemented       | Spec adopts JS/http/native DOM/node:sqlite/scrypt; no TS migration scheduled.                                           |
| 6   | Implemented       | Physical schema and flat layout documented; ordered migrations, legacy upgrade and rollback tests.                      |
| 7   | Done              | Explicit M0 sequencing/alpha exception recorded; v1 gates retained.                                                     |
| 8   | Implemented       | Codex requires trusted cwd and packaged output schema; unit tests.                                                      |
| 9   | Implemented       | Explicit T0 Bash/Edit/Write deny and T1 Bash deny; literal user setting source. Claude runtime verification still open. |
| 10  | Partial / blocked | V-1–V-12 tracked in M0 evidence; actual filesystem boundary failed.                                                     |
| 11  | Partial           | Real CLI sandbox observations saved; real model JSONL output fixtures still missing.                                    |
| 12  | Partial / failed  | macOS synthetic filesystem probes reproduce outside reads; Linux/network/full daily self-test missing.                  |
| 13  | Blocked           | No real spawn path enabled until per-version sandbox and credential boundaries pass.                                    |
| 14  | Blocked           | Requires verified live adapters; mock input continuation is not live session resume.                                    |
| 15  | Open              | YAML mock scripts, invocation counters, tool/file scenarios remain to implement.                                        |
| 16  | Open              | Managed worktrees and ref/config/hooks integrity checks.                                                                |
| 17  | Open              | Safe commit with precommit Gitleaks and exclusions.                                                                     |
| 18  | Open              | Diff UI, bound approvals, merge/reject and premerge checks.                                                             |
| 19  | Open              | No-push isolation and adversarial git safety tests.                                                                     |
| 20  | Open              | OS keyring and production subprocess environment/credential isolation.                                                  |
| 21  | Open              | RRULE, natural-language parsing and Chinese trigger display.                                                            |
| 22  | Open              | Pipelines; v1/v2 distinctions remain in the requirement matrix.                                                         |
| 23  | Open              | Encrypted export/backup, recovery and exclusion tests.                                                                  |
| 24  | Open              | Validated runharbor.config.yaml and adapter plugin loader.                                                              |
| 25  | Blocked for v1    | Docker/npm/service install plus signed provenance; alpha remains source/tgz only.                                       |
| 26  | Blocked           | All 19 baseline gates must pass; no full v1 release authorized by partial progress.                                     |

See [spec amendments](spec-amendments.md), [M0 evidence](m0-validation.md), [Actions review](actions-compatibility.md), and the [v1 gate](release-gate.md).
