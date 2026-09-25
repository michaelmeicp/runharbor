# M0 verification record

Status: **incomplete**. This record distinguishes observed facts from proposed integration behavior. No live model execution or paid API call was used in this development pass.

## Locally observed

| Check                      | Observation                                                                                                  | Consequence                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Codex version              | `codex-cli 0.157.0`                                                                                          | Version observed, not approved for live execution                          |
| `codex exec --help`        | JSON, explicit sandbox, output schema, last-message output, ignore-user-config and ignore-rules flags appear | Command planning only; integration unverified                              |
| `codex exec resume --help` | Explicit session ID, JSON, output schema and output file options appear                                      | Help availability is not a tested resumed conversation                     |
| Sandbox command            | Installed CLI accepts `codex sandbox [COMMAND]`; the specification's `codex sandbox macos` form failed       | Do not reuse old command syntax blindly                                    |
| Claude Code                | Not found on the local command path                                                                          | Live fixtures, permission flags, and sandbox tests blocked                 |
| Docker                     | Not found on the local command path                                                                          | Container execution and clean-container installation unverified            |
| Croner 10.0.1              | A 02:30 New York spring-gap schedule returned 03:30 on the same day                                          | Added a wall-clock match check; regression test skips the nonexistent time |

No provider credential files were read. No fabricated CLI session was submitted as a recorded fixture. Adapter tests are synthetic and labeled accordingly.

## Official references checked

- [Codex non-interactive mode](https://developers.openai.com/codex/noninteractive): JSON events and structured output integration.
- [Claude programmatic mode](https://code.claude.com/docs/en/headless): streamed output uses `--verbose`; bare mode has different authentication and discovery behavior.
- [Claude sandboxing](https://code.claude.com/docs/en/sandboxing): sandbox coverage must be established separately from CLI authentication.
- [Croner patterns](https://croner.56k.guru/usage/pattern/): timezone and cron semantics. Local regression testing takes precedence over an assumed interpretation of the documentation.
- [Node SQLite](https://nodejs.org/api/sqlite.html): built-in database API.
- [Orca repository](https://github.com/stablyai/orca): alternative to evaluate. No current star count is copied into product claims.

## Outstanding exit conditions

1. Seven-day comparison against the existing alternative, using generic non-sensitive recurring tasks. It has not been run and cannot be replaced by a short synthetic test.
2. Product-owner decision confirming standalone implementation versus integration. The current code is a standalone candidate, not evidence that the comparison is complete.
3. Installed Claude version and real redacted event recordings; Codex session resume and schema validation under actual execution.
4. OS sandbox probes on macOS and Ubuntu: forbidden read/write, loopback, network, environment, hooks, MCP, and shared-git integrity.
5. Official quota source integration and side-by-side validation against the provider's own UI.
6. Subscription-automation terms acknowledgement and authentication-mode decision. No legal conclusion is asserted here.

Live adapters must remain disabled until these controls are verified. A parser test or help listing is not sandbox evidence.
