# Contributing

Thanks for helping make recurring agent work easier to manage.

This is a mock-only development preview. Start with [implementation status](docs/implementation-status.md) and [release gates](docs/release-gate.md). Do not enable a live adapter merely because its output parser passes tests.

## Local workflow

1. Use Node.js 24.13+ and run `npm ci --ignore-scripts`.
2. Run `npm run verify`.
3. For UI changes, install Chromium with `npx playwright install chromium`, then run `npm run test:browser`.
4. Open a focused PR with the behavior changed, requirement IDs, tests, and any remaining limits.

## Good first contributions

- Complete `zh-Hant` UI translations without changing the execution boundary.
- Add keyboard and screen-reader coverage to existing flows.
- Add a scheduler regression with a deterministic clock.
- Improve documentation based on a clean-machine install.
- Add a synthetic parser fixture clearly labeled as synthetic.

## Live integration work

Requires separately reviewed evidence for version pinning, no repository hooks/MCP discovery, restricted reads/writes/network, secret isolation, process-group cancellation, and invariant-preserving permissions. Use disposable canary files; never place real credentials in a fixture. Do not read or copy a provider CLI's login credentials. Any newly enabled model call must make cost and authentication behavior explicit.

## Review rules

- No unsandboxed escape hatch, arbitrary shell string, unsafe DOM sink, default password, or silent paid fallback.
- Keep lockfile changes deliberate. Use `npm ci`, not unpinned installation in CI.
- Unknown values must remain unknown. Mock results cannot masquerade as live evidence.
- Do not submit private project prompts, customer data, real sessions, personal filesystem paths, or tokens.
- Changes to permissions, workflows, dependencies, or publishing need maintainer review.

Report vulnerabilities through the process in [SECURITY.md](SECURITY.md), not a public issue.
