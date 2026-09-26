# Actions compatibility review — 2026-09-26

## upload-artifact 4.6.2 → 7.0.1 (PR #1)

Reviewed upstream [v5](https://github.com/actions/upload-artifact/releases/tag/v5.0.0), [v6](https://github.com/actions/upload-artifact/releases/tag/v6.0.0), and [v7](https://github.com/actions/upload-artifact/releases/tag/v7.0.0). Node 24 requires runner >=2.327.1; this repository uses current GitHub-hosted Ubuntu/macOS runners. v7 migrates to ESM and adds optional direct single-file uploads. Keep the default archive mode: this job uploads multiple screenshots with a stable artifact name and seven-day retention. No consumer relies on a new direct-upload layout. CI must confirm screenshot upload succeeds before merge. The action remains pinned to a full SHA.

## Remaining Node 20 runtime

The Gitleaks action at ff98106e4c7b2bc287b24eaf42907196329070c7 still declares Node 20. Updating checkout/setup-node/upload-artifact alone will not eliminate every warning. Replace this wrapper with a checksum-pinned Gitleaks CLI scan after the existing Dependabot changes have passed and merged; do not suppress runtime warnings.
