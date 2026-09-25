# Testing and evidence

Run tests from the repository root:

```sh
npm run verify
npx playwright install chromium
npm run test:browser
```

## Evidence levels

| Level                       | What it establishes                                                     |
| --------------------------- | ----------------------------------------------------------------------- |
| Policy/unit test            | Deterministic decisions and validation in application code              |
| Mock integration            | Local task/schedule/inbox/output behavior using scripted events         |
| HTTP test                   | Authentication, request boundary, CSRF, setup and session behavior      |
| Browser test                | Actual rendered UI interactions and inert text handling                 |
| Live sandbox probe          | **Not performed:** CLI/tool filesystem, process and network confinement |
| Clean-platform installation | CI matrix prepared; verify workflow results separately                  |

Synthetic Codex/Claude event objects are not recordings. They cannot establish compatibility with any installed version. No model quality or quota accuracy is evaluated by mock runs.

## Important regressions

- Ten occurrences do not create tasks or threads.
- Retry attempts share one occurrence timestamp and suppress intermediate inbox noise.
- Spring DST gaps are skipped; repeated autumn wall-clock times execute once.
- Unknown/anomalous/estimated quota cannot cause automatic switching.
- Fallback cannot silently introduce another provider, paid billing, or broader permissions.
- Tampered output cannot be approved against its old content hash.
- Workspace cleanup preserves the independently stored artifact.
- Malicious output markup remains literal text in the browser.

## Known limits

The full 147 functional and 67 security requirements are not accepted. Tests do not cover real child-process isolation, cloud/provider behavior, 50,000-run performance, all crash points, complete deletion, migrations, backups, or every adversarial filesystem race. See the release checklist before drawing a production-readiness conclusion.
