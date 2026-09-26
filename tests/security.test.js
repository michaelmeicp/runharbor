import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import {
  hashPassword,
  verifyPassword,
  redact,
  readSafe,
  safeProjectPath,
  boundary,
  sha,
} from "../src/security.js";
import {
  permissions,
  params,
  tierToArgs,
  selectProfile,
  normalizeQuota,
  contextFor,
} from "../src/policy.js";
import { Store } from "../src/db.js";
import { structured, parseCodex, parseClaude } from "../src/adapters.js";

test("passwords are salted, verified with scrypt, and never saved in plaintext", async () => {
  const password = "a meaningful testing passphrase";
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert(!a.includes(password));
  assert(await verifyPassword(password, a));
  assert(!(await verifyPassword("wrong password", a)));
  await assert.rejects(hashPassword("short"));
});
test("redaction removes known secrets, encoded forms, token patterns and ANSI control sequences", () => {
  const secret = "synthetic-private-value";
  const result = redact(
    `${secret} ${encodeURIComponent(secret)} ${Buffer.from(secret).toString("base64")} ghp_${"a".repeat(36)} api_key=fixtureSecret \x1b[31mred`,
    [secret],
  );
  assert(!result.includes(secret));
  assert(!result.includes("fixtureSecret"));
  assert(!result.includes("ghp_"));
  assert(!result.includes("\x1b"));
});
test("Host, Origin, Fetch Metadata and JSON constraints reject cross-site requests", () => {
  const origin = "http://127.0.0.1:4317";
  const valid = {
    method: "POST",
    headers: {
      host: "127.0.0.1:4317",
      origin,
      "content-type": "application/json",
    },
  };
  boundary(valid, origin);
  for (const changed of [
    { host: "evil.example" },
    { origin: "https://evil.example" },
    { "sec-fetch-site": "cross-site" },
    { "content-type": "text/plain" },
    { "x-forwarded-for": "1.2.3.4" },
  ])
    assert.throws(() =>
      boundary({ ...valid, headers: { ...valid.headers, ...changed } }, origin),
    );
  assert.throws(() =>
    boundary(
      {
        ...valid,
        headers: { host: "127.0.0.1:4317", "content-type": "application/json" },
      },
      origin,
    ),
  );
});
test("path traversal, symlinks, system roots and home roots are denied", () => {
  const dir = mkdtempSync(join(tmpdir(), "rh-path-"));
  try {
    mkdirSync(join(dir, "artifacts"));
    mkdirSync(join(dir, "project"));
    writeFileSync(join(dir, "secret"), "private");
    writeFileSync(join(dir, "artifacts", "safe"), "safe");
    symlinkSync(join(dir, "secret"), join(dir, "artifacts", "link"));
    assert.equal(readSafe(join(dir, "artifacts"), "safe").toString(), "safe");
    assert.throws(() => readSafe(join(dir, "artifacts"), "../secret"));
    assert.throws(() => readSafe(join(dir, "artifacts"), "link"));
    for (const p of ["/", homedir(), "/etc", join(dir, "artifacts")])
      assert.throws(() => safeProjectPath(p, join(dir, "artifacts")));
    assert.equal(
      safeProjectPath(join(dir, "project"), join(dir, "artifacts")),
      realpathSync(join(dir, "project")),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("permission boundary rejects T5, U+S, external writes and wildcard networks", () => {
  for (const p of [
    { tier: 5 },
    { tier: 2, capabilities: ["U", "S"] },
    { tier: 2, capabilities: ["X"] },
    { tier: 3, network_allowlist: ["*"] },
    { tier: 3, network_allowlist: ["127.0.0.1"] },
    { tier: 2, network_allowlist: ["example.com"] },
    { tier: 3, network_allowlist: ["example.com"], capabilities: ["S"] },
  ])
    assert.throws(() => permissions(p));
  assert.throws(() => permissions({ tier: 2 }, { repo_type: "folder" }));
  assert.equal(permissions({}).tier, 2);
});
test("free parameters cannot inject shell or permission flags", () => {
  for (const p of [
    { args: "--yolo" },
    { sandbox: "danger-full-access" },
    { model: "--dangerously-skip-permissions" },
    { model: "x; echo pwned" },
    { effort: "extreme" },
  ])
    assert.throws(() => params(p));
  assert.deepEqual(params({ model: "example-model", effort: "high" }), {
    model: "example-model",
    effort: "high",
  });
});
test("argv generation is centralized and never permits unverified T3", () => {
  for (const agent of ["mock", "codex", "claude_code"])
    for (const tier of [0, 1, 2]) {
      const argv = tierToArgs(
        agent,
        { tier },
        {},
        { worktree: "/tmp/trusted workspace" },
      );
      assert(!argv.some((a) => /dangerously|yolo|full-auto/.test(a)));
      if (agent === "claude_code") assert(argv.includes("--verbose"));
    }
  assert.throws(() =>
    tierToArgs("codex", { tier: 3, network_allowlist: ["example.com"] }),
  );
});
const source = {
  id: "a",
  agent_id: "mock",
  provider: "local",
  auth_mode: "mock",
  enabled: true,
  max_tier: 3,
  sandbox_verified: true,
  params: {},
};
const target = { ...source, id: "b" };
const selection = (overrides = {}) =>
  selectProfile({
    source,
    candidates: [source, target],
    policy: { enabled: true, ordered_profile_ids: ["a", "b"] },
    project: { allowed_providers: ["local:mock"] },
    run: {
      tier: 2,
      capabilities: [],
      network_allowlist: [],
      workspace_mode: "artifact_only",
    },
    quotas: { a: { status: "rejected", used_pct: 100, confidence: "mock" } },
    ...overrides,
  });
test("failover preserves source permissions and rejects unapproved providers, paid targets and unsafe sandboxes", () => {
  assert.equal(selection().profile.id, "b");
  for (const patch of [
    { provider: "unapproved" },
    { paid: true },
    { sandbox_verified: false },
    { max_tier: 1 },
    { params: { model: "--yolo" } },
  ])
    assert.equal(
      selection({ candidates: [source, { ...target, ...patch }] }).profile,
      null,
    );
  assert.equal(
    selection({
      project: { allowed_providers: ["local:mock"], sensitive: true },
    }).profile,
    null,
  );
  assert.equal(selection({ policy: { enabled: false } }).profile, null);
  assert.equal(selection({ run: { tier: 2, pin_agent: true } }).profile, null);
  assert.equal(selection({ switches: 3 }).storm, true);
});
test("unknown, estimated and anomalous quota signals cannot drive switching", () => {
  for (const q of [
    { used_pct: 100, status: "rejected", confidence: "unknown" },
    { used_pct: 100, status: "rejected", confidence: "estimated" },
    { used_pct: 100, status: "rejected", confidence: "mock", anomalous: true },
  ])
    assert.equal(selection({ quotas: { a: q } }).profile.id, "a");
  assert(normalizeQuota({ used_pct: -1 }).anomalous);
  assert(normalizeQuota({ used_pct: 60 }, { used_pct: 1 }).anomalous);
});
test("after reset buffer the preferred profile becomes available again", () => {
  const q = {
    status: "rejected",
    used_pct: 100,
    confidence: "mock",
    resets_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(
    selection({ quotas: { a: q }, clock: Date.parse("2026-01-01T00:05:01Z") })
      .profile.id,
    "a",
  );
});
test("tainted memories cannot enter higher tiers or secret-bearing runs", () => {
  const result = contextFor({
    prompt: "Build a brief",
    memories: [
      { id: "safe", content: "SAFE", pinned: true, status: "active" },
      { id: "proposed", content: "PROPOSAL", pinned: true, status: "proposed" },
      {
        id: "unsafe",
        content: "TAINTED",
        pinned: true,
        status: "active",
        tainted: true,
        tier: 1,
      },
    ],
    run: { tier: 2, capabilities: ["S"] },
  });
  assert(result.prompt.includes("SAFE"));
  assert(!result.prompt.includes("TAINTED"));
  assert(!result.prompt.includes("PROPOSAL"));
});
test("template memory injection is not duplicated", () => {
  const c = contextFor({
    prompt: "Read {{project_memory}}",
    memories: [
      { id: "m", content: "UNIQUE_MEMORY", pinned: true, status: "active" },
    ],
    run: { tier: 2, capabilities: [] },
  });
  assert.equal(c.prompt.split("UNIQUE_MEMORY").length, 2);
});
test("structured output cannot smuggle executable actions through the schema", () => {
  const result = structured({
    summary: { did: "d", result: "r", next: "n" },
    content: "<script>alert(1)</script>",
    notable: false,
    action_requests: [{ tier: 5 }],
    destination: "/private",
  });
  assert(!("destination" in result));
  assert(!("action_requests" in result));
  assert.throws(() =>
    structured({ summary: { did: "a".repeat(81) }, content: "" }),
  );
});
test("synthetic adapter events retain unknown cost and ignore unknown event kinds", () => {
  assert.equal(
    parseCodex({
      type: "turn.completed",
      usage: { input_tokens: 100, output_tokens: 2 },
    }).payload.cost_usd,
    null,
  );
  assert.equal(parseCodex({ type: "future-event" }).type, "ignored");
  assert.equal(parseClaude({ type: "future-event" }).type, "ignored");
  assert.equal(
    parseClaude({
      type: "result",
      usage: { input_tokens: 10 },
      total_cost_usd: 0.1,
    }).payload.cost_kind,
    "api_equivalent_estimate",
  );
});
test("audit chain detects tampering and database rejects ambiguous Run ownership", () => {
  const dir = mkdtempSync(join(tmpdir(), "rh-db-"));
  const s = new Store(dir);
  try {
    s.audit("first", { value: "one" });
    s.audit("second", { value: "two" });
    assert(s.verifyAudit().valid);
    assert.throws(() => s.db.exec("UPDATE audit SET payload='{}' WHERE seq=1"));
    s.db.exec("DROP TRIGGER audit_no_update");
    s.db.exec("UPDATE audit SET payload='{}' WHERE seq=1");
    assert.equal(s.verifyAudit().break_at, 1);
    assert.throws(() => s.put("runs", { task_id: "t", schedule_id: "s" }));
    assert.throws(() => s.put("runs", {}));
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("two-character CJK search and persisted redaction", () => {
  const dir = mkdtempSync(join(tmpdir(), "rh-search-"));
  const s = new Store(dir);
  try {
    s.put("tasks", {
      title: "價格爬蟲",
      description: `api_key=doNotPersistMe`,
    });
    assert.equal(s.find("價格").length, 1);
    assert.equal(s.find("爬蟲").length, 1);
    assert.equal(s.find("doNotPersistMe").length, 0);
    assert.equal(sha("hello"), sha(Buffer.from("hello")));
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Codex binds cwd/schema and Claude explicitly denies T0/T1 mutations", () => {
  assert.throws(() => tierToArgs("codex", { tier: 0 }), /worktree/);
  const argv = tierToArgs(
    "codex",
    { tier: 0 },
    {},
    { worktree: "/tmp/space and $literal", outputSchema: "/tmp/schema.json" },
  );
  assert.equal(argv[argv.indexOf("-C") + 1], "/tmp/space and $literal");
  assert.equal(argv[argv.indexOf("--output-schema") + 1], "/tmp/schema.json");
  for (const tier of [0, 1, 2]) {
    const a = tierToArgs("claude_code", { tier });
    const denied = a[a.indexOf("--disallowedTools") + 1].split(",");
    assert.equal(a[a.indexOf("--setting-sources") + 1], "user");
    if (tier === 0)
      for (const tool of ["Bash", "Edit", "Write"])
        assert(denied.includes(tool));
    if (tier === 1) assert(denied.includes("Bash"));
    assert(denied.includes("WebFetch"));
    const settings = JSON.parse(a[a.indexOf("--settings") + 1]);
    assert(settings.disableAllHooks && settings.sandbox.failIfUnavailable);
  }
});
