# Actions compatibility review — 2026-09-26

## upload-artifact 4.6.2 → 7.0.1 (PR #1)

Reviewed upstream [v5](https://github.com/actions/upload-artifact/releases/tag/v5.0.0), [v6](https://github.com/actions/upload-artifact/releases/tag/v6.0.0), and [v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0). Node 24 requires runner >=2.327.1; this repository uses current GitHub-hosted Ubuntu/macOS runners. v7 migrates to ESM and adds optional direct single-file uploads. Keep the default archive mode: this job uploads multiple screenshots with a stable artifact name and seven-day retention. No consumer relies on a new direct-upload layout. CI must confirm screenshot upload succeeds before merge. The action remains pinned to a full SHA.

## Remaining Node 20 runtime

The Gitleaks action at ff98106e4c7b2bc287b24eaf42907196329070c7 still declares Node 20. Updating checkout/setup-node/upload-artifact alone will not eliminate every warning. Replace this wrapper with a checksum-pinned Gitleaks CLI scan after the existing Dependabot changes have passed and merged; do not suppress runtime warnings.

## setup-node 4.4.0 → 7.0.0 (PR #2)

Reviewed upstream [v5](https://github.com/actions/setup-node/releases/tag/v5.0.0), [v6](https://github.com/actions/setup-node/releases/tag/v6.0.0), and [v7](https://github.com/actions/setup-node/releases/tag/v7.0.0). Node 24 requires runner >=2.327.1. v5 introduces automatic cache detection; v6 limits automatic detection to npm. This workflow already explicitly selects npm caching and Node 24, so its intent is unchanged. v7 moves to ESM, changes cache internals, and stops exporting a dummy NODE_AUTH_TOKEN. Tests neither publish packages nor rely on that dummy value. Both OS installs, production audits, and browser tests must pass before merge.

PR #1 passed all four checks, including screenshot archive upload ([run 36207217615](https://github.com/michaelmeicp/runharbor/actions/runs/36207217615)), and was merged.

## checkout 4.4.0 → 7.0.1 (PR #3)

Reviewed upstream [v5](https://github.com/actions/checkout/releases/tag/v5.0.0), [v6](https://github.com/actions/checkout/releases/tag/v6.0.0), and [v7](https://github.com/actions/checkout/releases/tag/v7.0.0). Node 24 requires runner >=2.327.1. v6 relocates persisted credentials; all our checkout steps explicitly disable credential persistence. v7 blocks unsafe fork checkout under privileged pull_request_target/workflow_run triggers; this CI uses push/pull_request, so that protection requires no bypass. ESM changes are internal to the action. Preserve full history for Gitleaks and validate all four checks before merge.

PR #2 passed all four checks ([run 36207352503](https://github.com/michaelmeicp/runharbor/actions/runs/36207352503)) and was merged.
