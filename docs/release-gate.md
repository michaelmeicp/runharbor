# v1 release gate

**BLOCKED. Do not publish v1.0 or describe this development build as satisfying the complete requirements.**

The supplied specification requires all 19 baseline items before v1 release, explicitly including the first open-source launch. This checklist records gaps rather than waiving them. The product owner subsequently authorized testing and publishing the explicitly labeled mock-only preview. That exception permits `0.1.0-alpha.1` to be public; it does not waive the v1.0 gates or enable live agents.

| #   | Baseline                                       | Current evidence / remaining work                                                                                            |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | Local web boundary                             | Automated auth, Host, Origin, CSRF, JSON, CSP and SSE tests; Secure `__Host-` cookie and broader rendering review still open |
| 2   | Agent cannot access application API            | No real process launches; real sandbox network proof pending                                                                 |
| 3   | Mandatory OS sandbox and scoped reads/writes   | Real adapters blocked; macOS/Linux probes pending                                                                            |
| 4   | Ignore repository agent configuration          | Proposed flags only; adversarial fixture execution pending                                                                   |
| 5   | No host execution of agent code; git integrity | No code execution or git integration implemented                                                                             |
| 6   | Central permission mapping                     | T0–T3 policy tests; T5 denied; live argv equivalence pending                                                                 |
| 7   | Reader/Publisher split and bound approvals     | U/S/X guards and local-delivery hash tests; complete production Publisher path-hardening pending                             |
| 8   | Auto-merge restrictions                        | Auto-merge unavailable; safe merge workflow pending                                                                          |
| 9   | Taint and memory protections                   | Active human memory and taint-aware context tests; instruction-file diff review pending                                      |
| 10  | Keys, env isolation and redaction              | No provider keys accepted or read; baseline redaction tests; keyring and full scanner integration pending                    |
| 11  | Safe git and pre-commit scanning               | No agent git operations; gitleaks commit/merge integration pending                                                           |
| 12  | Safe failover                                  | Mock policy and new-run tests; live quota, failback circuits, credential isolation and paid budget enforcement pending       |
| 13  | Budgets and emergency stop                     | Local run limits, UI/CLI/sentinel stop; live process-group termination and complete multi-layer spend accounting pending     |
| 14  | Auditing                                       | Append-only hash chain and verification; complete live tool/command audit coverage pending                                   |
| 15  | CLI pinning and self-tests                     | Local version evidence and blocked adapters; upgrade wizard and daily probes pending                                         |
| 16  | Data protection                                | Private file permissions; FDE detection, encrypted exports, migrations/backups and permanent deletion pending                |
| 17  | Open-source distribution                       | Documentation and CI prepared; repository settings and trusted, attested npm/container release not yet verified              |
| 18  | Terms acknowledgement                          | Documentation supplied; live subscription scheduling unavailable; acknowledgement flow pending                               |
| 19  | Automated safety tests                         | Unit, HTTP, scheduler and browser suites; full cross-platform baseline and branch-protection verification pending            |

No item is marked fully complete based on an unavailable feature. Blocking a risky feature is a safe development behavior, not fulfillment of the requested functionality.
