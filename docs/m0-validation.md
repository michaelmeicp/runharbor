# M0 verification — 2026-09-26

M0 is **not passed**. Codex CLI 0.157.0 is installed and reports ChatGPT login. Claude CLI, Gemini CLI, and Docker are absent on this host. No provider credentials have been read, copied, or published. No billable model calls were made during these probes.

## Reproducible local evidence

`node scripts/m0-probe.js /tmp/runharbor-m0.json` runs synthetic filesystem probes. Exit 1 means unsafe or unknown, never success. The script creates a disposable home and canaries under credential-shaped paths, a fake app database, another project, and fake main refs. It records only booleans and generic names, then cleans up. It does not test the user's actual credentials.

[Recorded macOS result](../fixtures/m0/codex-0.157.0-macos-filesystem.json): T0 `:read-only` and T1/T2 `:workspace` could read every outside-workspace canary. They denied outside writes and ref writes; allowed workspace writes matched the requested tier. This is insufficient for SEC-018. A restricted read profile or outer isolation must be implemented and retested before live agents can be enabled. Network, real linked-worktree refs, automatic daily/upgrade gating, and CLI-tool read paths require additional tests; this filesystem probe is not full SEC-063.

The installed version uses `codex sandbox -P <profile> -C <cwd> -- <command>`. The older `sandbox macos` form is not accepted. `exec` and `exec resume` help list `--json`, `-o`, and `--output-schema`; help alone does not prove successful resumed generation or flag ordering.

| Item | Status                       | Evidence or missing prerequisite                                                                     |
| ---- | ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| V-1  | Partial                      | Installed help lists flags; authenticated initial/resumed JSONL fixture still required.              |
| V-2  | Failed required boundary     | Outside-workspace canary reads succeed on macOS. Linux not yet verified.                             |
| V-3  | Open                         | Malicious project config/rules fixture tests not yet run.                                            |
| V-4  | Open                         | MCP override behavior not proven with installed CLI.                                                 |
| V-5  | Blocked                      | Claude unavailable; actual linked-worktree ref probe needed.                                         |
| V-6  | Open                         | No live rate-limit fixture or comparison with CLI status.                                            |
| V-7  | Blocked                      | Claude unavailable; bare defaults/permission-prompts cannot be claimed.                              |
| V-8  | Open, v2                     | Gemini unavailable.                                                                                  |
| V-9  | Open                         | 0.157.0 is observed, not a certified minimum or supported version range.                             |
| V-10 | Open                         | Adversarial filter/diff/hook tests still needed for system git implementation.                       |
| V-11 | External review required, v2 | No legal approval or provider-terms acceptance is inferred.                                          |
| V-12 | Blocked                      | Claude unavailable; no actual overage event recording. Synthetic fixtures must be labeled synthetic. |

G4 requires real Codex and Claude task completion, output, and session continuation. None is claimed from the offline policy builder or the mock UI. Original one-week M0 comparison also remains outstanding.
