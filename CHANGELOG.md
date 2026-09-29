# Changelog

## 0.1.0-alpha.2 — verified mock-only preview

- Transactional database migrations preserve existing data and verify migration history.
- Proposed CLI policies bind trusted worktree/schema paths and enforce explicit permission denials; live execution remains disabled.
- Publication checks and synthetic screenshots avoid personal workstation details.
- Release archives include NOTICE, the changelog and contribution guidance. CI installs the actual archive in a fresh directory and verifies authentication, web assets, mock output, migrations and CLI startup.

## 0.1.0-alpha.1 — mock-only public preview

- Local password-protected workbench with projects, tasks, runs, and permanent outputs.
- Exception inbox with input continuation, severity, deduplication, snooze and undo.
- Persisted cron scheduling with timezone previews, retry, queue control, bounded catch-up and DST regression coverage.
- Scripted mock scenarios and explicitly unknown live quota values.
- Permission-constrained mock fallback, human project memory and taint-aware context.
- Content-bound local-folder delivery approvals and emergency stop.
- SQLite search, event history, audit-chain verification, CLI doctor.
- English-first responsive UI, partial Traditional Chinese navigation, documentation and tests.

Live agents and the complete v1 requirements are not implemented. See the implementation matrix and release gate. This is a GitHub prerelease. No production v1 release, npm-registry publication, or container image is claimed.
