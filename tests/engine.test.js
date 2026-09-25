import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../src/db.js";
import { Engine } from "../src/engine.js";
import { nextDates, missedOccurrences } from "../src/schedule.js";

async function fixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), "rh-engine-")),
    s = new Store(dir);
  let time = Date.parse("2026-01-01T00:00:00Z");
  const e = new Engine(s, { delay: 1, clock: () => time });
  const project = e.project({ name: "Test project" });
  try {
    await fn({
      s,
      e,
      project,
      dir,
      advance: (ms) => (time += ms),
      time: () => time,
    });
  } finally {
    await e.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
async function drain(e) {
  await e.tick();
  await Promise.all([...(e.work || [])]);
}
test("ten schedule occurrences add no tasks or threads; successful outputs stay out of inbox", () =>
  fixture(async ({ s, e, project, advance }) => {
    const schedule = e.schedule({
      project_id: project.id,
      name: "Every minute",
      prompt_template: "Prepare a brief",
      cron_expr: "* * * * *",
      timezone: "UTC",
      notify_policy: "never",
    });
    e.scheduleState(schedule.id, "enabled", true);
    for (let i = 0; i < 10; i++) {
      advance(60000);
      await drain(e);
    }
    const runs = s.all("runs");
    assert.equal(new Set(runs.map((r) => r.scheduled_for)).size, 10);
    assert.equal(runs.length, 10);
    assert(runs.every((r) => r.status === "succeeded" && r.summary));
    assert.equal(s.all("tasks").length, 0);
    assert.equal(s.all("threads").length, 0);
    assert.equal(s.all("artifacts").length, 10);
    assert.equal(s.all("inbox").length, 0);
  }));
test("global pause creates no skipped or queued runs and resume skips the paused interval", () =>
  fixture(async ({ s, e, project, advance }) => {
    const schedule = e.schedule({
      project_id: project.id,
      name: "Pause test",
      prompt_template: "Brief",
      cron_expr: "* * * * *",
      timezone: "UTC",
    });
    e.scheduleState(schedule.id, "enabled", true);
    e.pause(true);
    advance(3600000);
    await drain(e);
    assert.equal(s.all("runs").length, 0);
    e.pause(false);
    await drain(e);
    assert.equal(s.all("runs").length, 0);
    advance(60000);
    await drain(e);
    assert.equal(s.all("runs").length, 1);
  }));
test("schedule retries preserve occurrence identity and hide intermediate failures", () =>
  fixture(async ({ s, e, project, advance }) => {
    const schedule = e.schedule({
      project_id: project.id,
      name: "Retry",
      prompt_template: "Brief",
      scenario: "timeout_twice",
      retry_backoff_sec: 1,
    });
    e.enqueue({ schedule_id: schedule.id });
    await drain(e);
    advance(1000);
    await drain(e);
    advance(2000);
    await drain(e);
    const runs = s.all("runs");
    assert.equal(runs.length, 3);
    assert.equal(runs.filter((r) => r.status === "succeeded").length, 1);
    assert.equal(new Set(runs.map((r) => r.scheduled_for)).size, 1);
    assert.equal(s.all("inbox").length, 0);
    assert.equal(runs.filter((r) => r.retry_of_run_id).length, 2);
  }));
test("queue policy bounds pending runs to one", () =>
  fixture(async ({ s, e, project }) => {
    const schedule = e.schedule({
      project_id: project.id,
      name: "Queue",
      prompt_template: "Brief",
      concurrency_policy: "queue",
    });
    for (let i = 0; i < 5; i++) e.enqueue({ schedule_id: schedule.id });
    assert.equal(s.all("runs").filter((r) => r.status === "pending").length, 1);
    assert.equal(s.all("runs").filter((r) => r.status === "skipped").length, 4);
  }));
test("catch-up limits and DST gap/overlap behavior", () => {
  const base = {
    cron_expr: "*/10 * * * *",
    timezone: "UTC",
    next_run_at: "2026-01-01T00:00:00Z",
  };
  for (const [policy, count] of [
    ["run_once", 1],
    ["run_all", 3],
    ["skip", 0],
  ])
    assert.equal(
      missedOccurrences(
        { ...base, catch_up_policy: policy },
        Date.parse("2026-01-01T02:00:00Z"),
      ).due.length,
      count,
    );
  const gap = nextDates(
    "30 2 * * *",
    "America/New_York",
    new Date("2026-03-08T05:00:00Z"),
    1,
  );
  assert(gap[0].startsWith("2026-03-09"));
  const overlap = nextDates(
    "30 1 * * *",
    "America/New_York",
    new Date("2026-11-01T04:00:00Z"),
    2,
  );
  assert(overlap[0].startsWith("2026-11-01"));
  assert(overlap[1].startsWith("2026-11-02"));
});
test("needs_input resumes a task and resolves its exception", () =>
  fixture(async ({ s, e, project }) => {
    const t = e.task({
      project_id: project.id,
      title: "Need answer",
      scenario: "needs_input",
    });
    const r = e.enqueue({ task_id: t.id });
    await drain(e);
    assert.equal(s.get("tasks", t.id).status, "awaiting_input");
    e.answer(r.id, "Short overview");
    await drain(e);
    assert.equal(s.get("tasks", t.id).status, "done");
    assert.equal(s.all("threads").length, 1);
    assert(s.all("inbox").every((i) => i.state === "resolved"));
  }));
test("schedule input escalation leaves original Run task_id null", () =>
  fixture(async ({ s, e, project }) => {
    const schedule = e.schedule({
      project_id: project.id,
      name: "Need input",
      prompt_template: "Brief",
      scenario: "needs_input",
    });
    const r = e.enqueue({ schedule_id: schedule.id });
    await drain(e);
    assert.equal(s.get("runs", r.id).task_id, null);
    assert.equal(s.all("tasks").length, 1);
    assert.equal(s.all("tasks")[0].status, "awaiting_input");
  }));
test("fallback starts a distinct run without higher permissions", () =>
  fixture(async ({ s, e, project }) => {
    e.setFailover(project.id, {
      confirmed: true,
      ordered_profile_ids: ["mock-primary", "mock-backup"],
    });
    e.quota("mock-primary", { status: "rejected", used_pct: 100 });
    const schedule = e.schedule({
      project_id: project.id,
      name: "Fallback",
      prompt_template: "Brief",
    });
    e.enqueue({ schedule_id: schedule.id });
    await drain(e);
    await drain(e);
    const runs = s.all("runs");
    assert.equal(runs.length, 2);
    const next = runs.find((r) => r.trigger === "failover");
    assert.equal(next.profile_id, "mock-backup");
    assert.equal(next.status, "succeeded");
    assert.equal(next.tier, 2);
    assert.equal(s.all("failovers").length, 1);
    assert.equal(
      s.all("inbox").filter((i) => i.type === "failover_switched").length,
      1,
    );
  }));
test("unknown quota does not block execution and exhausted quota without fallback defers", () =>
  fixture(async ({ s, e, project }) => {
    const t = e.task({ project_id: project.id, title: "Unknown quota" });
    const r = e.enqueue({ task_id: t.id });
    await drain(e);
    assert.equal(s.get("runs", r.id).status, "succeeded");
    e.quota("mock-primary", { status: "rejected", used_pct: 100 });
    const r2 = e.enqueue({ task_id: t.id });
    await drain(e);
    assert.equal(s.get("runs", r2.id).status, "deferred");
    assert.equal(
      s.all("inbox").filter((i) => i.type === "quota_warning").length,
      1,
    );
  }));
test("emergency stop blocks dispatch and approvals, cancels queued work and disables fallback", () =>
  fixture(async ({ s, e, project }) => {
    e.setFailover(project.id, {
      confirmed: true,
      ordered_profile_ids: ["mock-primary", "mock-backup"],
    });
    const t = e.task({ project_id: project.id, title: "Stop test" });
    e.enqueue({ task_id: t.id });
    e.stopAll();
    assert(s.all("runs").every((r) => r.status === "cancelled"));
    assert.throws(() => e.enqueue({ task_id: t.id }));
    assert.equal(s.get("projects", project.id).failover_policy.enabled, false);
    e.resume();
    assert(!e.stopped());
  }));
test("test runs do not produce inbox alerts", () =>
  fixture(async ({ s, e, project }) => {
    const schedule = e.schedule({
      project_id: project.id,
      name: "Test failure",
      prompt_template: "Brief",
      scenario: "crash",
    });
    e.enqueue({ schedule_id: schedule.id, is_test: true });
    await drain(e);
    assert.equal(s.all("inbox").length, 0);
    assert.equal(s.get("schedules", schedule.id).consecutive_failures, 0);
  }));
test("local delivery requires approval; tampering invalidates it; cleanup retains artifact", () =>
  fixture(async ({ s, e, project, dir }) => {
    const dest = mkdtempSync(join(tmpdir(), "rh-delivery-"));
    try {
      const d = e.destination(project.id, { name: "Reports", path: dest });
      const schedule = e.schedule({
        project_id: project.id,
        name: "Report",
        prompt_template: "Brief",
      });
      e.updateSchedule(schedule.id, { destination_id: d.id });
      const r = e.enqueue({ schedule_id: schedule.id });
      await drain(e);
      const a = s.all("approvals")[0];
      assert(!existsSync(join(dest, `${r.id}.md`)));
      const artifact = s.all("artifacts")[0],
        path = join(dir, "artifacts", artifact.path),
        original = readFileSync(path);
      writeFileSync(path, "tampered");
      assert.throws(() => e.approve(a.id, a.content_hash));
      writeFileSync(path, original);
      e.approve(a.id, a.content_hash);
      assert.equal(
        readFileSync(join(dest, `${r.id}.md`)).toString(),
        original.toString(),
      );
      e.cleanup(r.id);
      assert(existsSync(path));
      assert(!existsSync(join(dir, "workspaces", r.id)));
    } finally {
      rmSync(dest, { recursive: true, force: true });
    }
  }));
test("inbox deduplication and batch undo preserve state", () =>
  fixture(async ({ s, e, project }) => {
    for (let i = 0; i < 10; i++)
      e.notify({
        project_id: project.id,
        type: "quota_warning",
        severity: "warning",
        title: "Quota",
        dedupe_key: "same",
      });
    assert.equal(s.all("inbox").length, 1);
    assert.equal(s.all("inbox")[0].occurrence_count, 10);
    const result = e.inboxAction([s.all("inbox")[0].id], "dismiss");
    assert.equal(s.all("inbox")[0].state, "dismissed");
    e.undoInbox(result.undo_id);
    assert.equal(s.all("inbox")[0].state, "open");
  }));
