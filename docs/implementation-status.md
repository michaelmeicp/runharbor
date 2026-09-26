# Implementation status

## Prioritized follow-up (2026-09-26)

- P0.1: added job-scoped `contents: read` and `pull-requests: read` for Gitleaks; the observed PR failure was HTTP 403 while listing PR commits. Verification is tracked on PR #4.
- P0.2: PR #4 passed all four checks ([run 36207096864](https://github.com/michaelmeicp/runharbor/actions/runs/36207096864)) and was merged.
- P0.3: PR #1 reviewed, all checks passed, merged; PR #2 validation in progress; see [Actions compatibility](actions-compatibility.md).
- P1–P5: queued in the product owner's priority order; full v1 remains blocked.

## Requirement matrix

This matrix preserves the supplied v2.0 requirement IDs without publishing the original private product brief. **No requirement is declared fully accepted by this development pass.** A partial implementation may satisfy individual acceptance cases while leaving other cases open.

- **Partial / mock:** code or a deterministic test exists, but complete v1 acceptance is not established.
- **Open:** not implemented, or requires live-platform evidence.
- **Later:** specified for v2/v3; not part of this preview.

The original scope has 147 functional requirements and 67 security requirements. Do not convert the partial count into a completion percentage.

| ID          | Area                         | Target    | Status         | Evidence / next work                                                                    |
| ----------- | ---------------------------- | --------- | -------------- | --------------------------------------------------------------------------------------- |
| FR-AGT-001  | Adapters and routing         | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-002  | Adapters and routing         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-AGT-003  | Adapters and routing         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-AGT-004  | Adapter integration          | v1 Must   | Open           | Complete implementation and original acceptance tests required.                         |
| FR-AGT-005  | Adapters and routing         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-AGT-006  | Adapters and routing         | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-007  | Adapters and routing         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-AGT-008  | Adapters and routing         | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-010  | Adapters and routing         | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-011  | Adapters and routing         | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-012  | Adapter integration          | v2 Should | Open           | Complete implementation and original acceptance tests required.                         |
| FR-AGT-013  | Adapters and routing         | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-014  | Adapters and routing         | v3 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-015  | Adapters and routing         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-AGT-016  | Adapters and routing         | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-017  | Adapters and routing         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-AGT-018  | Adapters and routing         | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-AGT-019  | Adapters and routing         | v3 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-INB-001  | Exception inbox              | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-002  | Exception inbox              | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-003  | Exception inbox              | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-004  | Exception inbox              | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-005  | Exception inbox              | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-006  | Exception inbox              | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-007  | Exception inbox              | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-INB-008  | Exception inbox              | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-INB-009  | Exception inbox              | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-INB-010  | Exception inbox              | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-INB-011  | Exception inbox              | v1 Should | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-INB-012  | Exception inbox              | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-LOG-001  | Logging                      | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-LOG-002  | Logging                      | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-LOG-003  | Logging                      | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-MEM-001  | Project memory               | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-MEM-002  | Project memory               | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-MEM-003  | Project memory               | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-MEM-004  | Project memory               | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-MEM-005  | Project memory               | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-OSS-001  | Distribution and open source | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-OSS-002  | Distribution and open source | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-OSS-003  | Distribution and open source | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-OUT-001  | Outputs and delivery         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-OUT-002  | Outputs and delivery         | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-PIPE-001 | Pipelines                    | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-PIPE-002 | Pipelines                    | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-PRJ-001  | Project lifecycle            | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-PRJ-002  | Project lifecycle            | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-PRJ-003  | Project lifecycle            | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-PRJ-004  | Project lifecycle            | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-PRJ-005  | Project lifecycle            | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-PRJ-006  | Project lifecycle            | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-PRJ-007  | Project lifecycle            | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-PRJ-009  | Project lifecycle            | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-PRJ-010  | Project lifecycle            | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-QTA-001  | Quota and failover           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-QTA-002  | Quota and failover           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-QTA-003  | Quota and failover           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-QTA-004  | Quota and failover           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-QTA-005  | Quota and failover           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-QTA-006  | Quota and failover           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-REV-001  | Review and merge             | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-REV-002  | Review and merge             | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-REV-003  | Review and merge             | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-REV-004  | Review and merge             | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-REV-005  | Review and merge             | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-REV-006  | Review and merge             | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-REV-007  | Review and merge             | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-REV-008  | Review and merge             | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-REV-009  | Review and merge             | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-001  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-002  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-003  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-004  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-005  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-006  | Schedules and recovery       | v1 Should | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-007  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-008  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-009  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-010  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-011  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-012  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-013  | Schedules and recovery       | v1 Should | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-014  | Schedules and recovery       | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-015  | Schedules and recovery       | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-016  | Schedules and recovery       | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-017  | Schedules and recovery       | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-018  | Schedules and recovery       | v1 Should | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-019  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-020  | Schedules and recovery       | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-021  | Schedules and recovery       | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SCH-022  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-023  | Schedules and recovery       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SCH-024  | Schedules and recovery       | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SET-001  | Settings and onboarding      | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SET-002  | Settings and onboarding      | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SET-003  | Settings and onboarding      | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SET-004  | Settings and onboarding      | v1 Should | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SET-005  | Settings and onboarding      | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-SET-006  | Settings and onboarding      | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-SET-007  | Settings and onboarding      | v1 Should | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SET-008  | Settings and onboarding      | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-SRC-001  | Search                       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SRC-002  | Search                       | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SRC-003  | Search                       | v3 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-SUM-001  | Summaries                    | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SUM-002  | Summaries                    | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SUM-003  | Summaries                    | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-SUM-004  | Summaries                    | v1 Could  | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-THR-001  | Threads and interaction      | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-THR-002  | Threads and interaction      | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-THR-003  | Threads and interaction      | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-THR-004  | Threads and interaction      | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-THR-005  | Threads and interaction      | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-THR-006  | Threads and interaction      | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-THR-007  | Threads and interaction      | v2 Should | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-THR-008  | Threads and interaction      | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-THR-009  | Threads and interaction      | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-TSK-001  | Tasks                        | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-TSK-002  | Tasks                        | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-TSK-003  | Tasks                        | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-004  | Tasks                        | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-TSK-005  | Tasks                        | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-006  | Tasks                        | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-TSK-007  | Tasks                        | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-008  | Tasks                        | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-TSK-009  | Tasks                        | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-011  | Tasks                        | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-012  | Tasks                        | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-013  | Tasks                        | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-TSK-014  | Tasks                        | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-USG-001  | Usage and budgets            | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-USG-002  | Usage and budgets            | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-USG-003  | Usage and budgets            | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-USG-004  | Usage and budgets            | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-USG-005  | Usage and budgets            | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-USG-006  | Usage and budgets            | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-001  | Workspaces and git           | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-002  | Workspaces and git           | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-003  | Workspaces and git           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-WSP-004  | Workspaces and git           | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-005  | Workspaces and git           | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-006  | Workspaces and git           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| FR-WSP-007  | Workspaces and git           | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-008  | Workspaces and git           | v1 Should | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-009  | Workspaces and git           | v1 Must   | Open           | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-010  | Workspaces and git           | v2 Could  | Later          | Implement and verify against the original acceptance criteria.                          |
| FR-WSP-011  | Workspaces and git           | v1 Must   | Partial / mock | See [architecture](architecture.md) and [tests](testing.md); missing cases remain open. |
| SEC-001     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-002     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-003     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-004     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-005     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-006     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-007     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-008     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-009     | Security                     | v2 Must   | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-010     | Security                     | v2 Must   | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-011     | Security                     | v2 Must   | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-012     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-013     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-014     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-015     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-016     | Security                     | v1 Should | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-017     | Security                     | v1 Must   | Open           | Complete implementation and original acceptance tests required.                         |
| SEC-018     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-019     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-020     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-021     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-022     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-023     | Security                     | v2 Should | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-024     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-025     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-026     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-027     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-028     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-029     | Security                     | v2 Must   | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-030     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-031     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-032     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-033     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-034     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-035     | Security                     | v2 Should | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-036     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-037     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-038     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-039     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-040     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-041     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-042     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-043     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-044     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-045     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-046     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-047     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-048     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-049     | Security                     | v2 Should | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-050     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-051     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-052     | Security                     | v1 Should | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-053     | Security                     | v1 Should | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-054     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-055     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-056     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-057     | Security                     | v1 Should | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-058     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-059     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-060     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-061     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-062     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-063     | Security                     | v1 Must   | Open           | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-064     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-065     | Security                     | v1 Must   | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-066     | Security                     | v2 Should | Later          | See [release gate](release-gate.md); complete acceptance still required.                |
| SEC-067     | Security                     | v1 Should | Partial / mock | See [release gate](release-gate.md); complete acceptance still required.                |

## Delivery boundaries

The current executable slice is the local mock workbench. It does not replace the requested v1 product. In particular, G4 (live Codex/Claude), G7 (signed installable public distribution), G8 (verified live quota), G9 (complete live switching/failback), and G10 (full sandbox baseline) remain unfulfilled.

The product owner authorized public publication of the mock-only preview after reviewing its limitations. This scope exception does not change the outstanding v1 acceptance criteria.
