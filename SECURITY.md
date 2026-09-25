# Security policy

## Supported status

| Version         | Status                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| `0.1.0-alpha.1` | Development preview; mock execution only; no production-security claim |
| `1.x`           | Not released                                                           |

The [release checklist](docs/release-gate.md) is incomplete. Keep real-agent execution disabled. Do not expose the service through a tunnel or reverse proxy. Remote headers are rejected; remote access and approval are unsupported.

## Report a vulnerability

Use **GitHub → Security → Report a vulnerability** in this repository when private reporting is enabled. Do not include secrets, private prompts, session cookies, or provider credentials. If the private-reporting control is unavailable, request a private contact channel without disclosing the vulnerability. A backup email address has not yet been configured; that remains a release-readiness item.

Please include the version, OS, a minimal reproduction using synthetic data, and the expected versus observed boundary. The intended response targets are acknowledgement within three business days and mitigation or a status update for critical/high issues within 30 days; these are maintainer goals, not a staffed service guarantee.

Coordinate disclosure until a fix or mitigation is available. Provider CLI vulnerabilities should also be reported to the relevant upstream vendor. Use GitHub Security Advisories for coordinated releases when appropriate.

## Current boundaries

- Loopback only, password setup with a random one-time code, scrypt hashes, HttpOnly/SameSite sessions, Host/Origin checks and CSRF tokens.
- Inert text rendering; outputs never execute as HTML or SVG.
- No provider credentials accepted, read, stored, or forwarded by this build.
- No real CLI spawn, model-generated shell commands, git merges, or network publishers.
- Mock policy checks do not establish OS sandbox security.
- Local data is plaintext under private filesystem permissions; use full-disk encryption. FDE detection and encrypted backup/export are not implemented.
- Loopback HTTP lacks the intended `__Host-` Secure cookie deployment. Full redaction/scanning and concurrent filesystem race resistance remain open gates.

## Incident response

1. Select **Emergency stop** or run `runharbor stop-all` with the same data directory.
2. Inspect the audit chain and relevant run IDs before changing evidence.
3. If credentials were exposed outside this application, revoke them using the provider's official account controls and sign out affected CLI sessions.
4. Review project files, default branch history, and stored memory; revert suspicious changes.
5. Restore from a known-good backup. Verify the original cause before resuming.

Do not upload a full database or raw log to a public issue.
