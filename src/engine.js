import { EventEmitter } from "node:events";
import {
  mkdirSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  rmSync,
  realpathSync,
  openSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { now } from "./db.js";
import {
  insist,
  choice,
  number,
  text,
  sha,
  redact,
  safeProjectPath,
  readSafe,
  AppError,
} from "./security.js";
import {
  permissions,
  contextFor,
  tierToArgs,
  normalizeQuota,
  selectProfile,
  quotaBlocked,
} from "./policy.js";
import { mockEvents, SCENARIOS } from "./adapters.js";
import { nextDates, missedOccurrences } from "./schedule.js";

const terminal = [
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
  "interrupted",
  "skipped",
];
const retryable = [
  "timeout",
  "stalled",
  "agent_crash",
  "success_criteria_failed",
];
const summary = (did, result, next) =>
  Object.fromEntries(
    Object.entries({ did, result, next }).map(([k, v]) => [
      k,
      [...redact(v)].slice(0, 80).join(""),
    ]),
  );

export class Engine extends EventEmitter {
  constructor(store, { delay = 250, clock = () => Date.now() } = {}) {
    super();
    this.s = store;
    this.active = new Map();
    this.delay = delay;
    this.clock = clock;
    this.ticking = false;
    this.heartbeat = now();
    if (!store.all("profiles").length)
      for (const p of [
        {
          id: "mock-primary",
          name: "Mock · primary",
          agent_id: "mock",
          provider: "local",
          auth_mode: "mock",
          model: "scripted",
          enabled: true,
          sandbox_verified: true,
          max_tier: 3,
        },
        {
          id: "mock-backup",
          name: "Mock · backup",
          agent_id: "mock",
          provider: "local",
          auth_mode: "mock",
          model: "scripted-backup",
          enabled: true,
          sandbox_verified: true,
          max_tier: 3,
        },
        {
          id: "codex",
          name: "Codex CLI",
          agent_id: "codex",
          provider: "openai",
          auth_mode: "subscription",
          model: null,
          enabled: false,
          sandbox_verified: false,
          max_tier: 0,
        },
        {
          id: "claude",
          name: "Claude Code",
          agent_id: "claude_code",
          provider: "anthropic",
          auth_mode: "subscription",
          model: null,
          enabled: false,
          sandbox_verified: false,
          max_tier: 0,
        },
      ])
        store.put("profiles", { ...p, paid: false, params: {} });
    for (const run of this.runs().filter((r) =>
      ["running", "preparing"].includes(r.status),
    ))
      this.finish(
        run,
        "interrupted",
        "Service restarted before this mock run completed.",
      );
  }
  start() {
    this.timer = setInterval(() => {
      this.tick().catch((e) => {
        this.s.audit("scheduler_error", { message: e.message });
      });
    }, 1000);
    this.timer.unref();
  }
  async close() {
    clearInterval(this.timer);
    for (const ctl of this.active.values()) ctl.abort();
    await Promise.allSettled([...(this.work || [])]);
  }
  runs() {
    return this.s.all("runs", null, 100000);
  }
  notify(item) {
    const existing = this.s
      .all("inbox")
      .find(
        (i) =>
          i.dedupe_key === item.dedupe_key &&
          !["resolved", "dismissed"].includes(i.state),
      );
    const value = this.s.put("inbox", {
      ...existing,
      ...item,
      state: "open",
      occurrence_count: (existing?.occurrence_count || 0) + 1,
    });
    this.emit("change");
    return value;
  }
  resolve(key) {
    for (const i of this.s
      .all("inbox")
      .filter((i) => i.dedupe_key === key && i.state !== "resolved"))
      this.s.put("inbox", { ...i, state: "resolved", resolved_at: now() });
  }
  project(input) {
    const p = {
      name: text(input.name, "Project name", 100),
      description: text(input.description || "", "Description", 4000, true),
      repo_type: "artifact_only",
      repo_path: null,
      trust_level: "trusted",
      default_profile_id: "mock-primary",
      default_tier: 2,
      allowed_providers: ["local:mock"],
      sensitive: Boolean(input.sensitive),
      auto_merge_policy: "never",
      archived: false,
      budget_monthly_runs: 1000,
      failover_policy: {
        enabled: false,
        ordered_profile_ids: [],
        allow_paid: false,
      },
    };
    if (input.repo_path) {
      p.repo_path = safeProjectPath(input.repo_path, this.s.dir);
      p.repo_type = "folder";
      p.default_tier = 1;
    }
    const result = this.s.put("projects", p);
    this.s.audit("project_created", { project_id: result.id });
    return result;
  }
  task(input) {
    const project = this.s.get("projects", input.project_id);
    insist(!project.archived, "Restore the project before creating tasks.");
    const task = this.s.put("tasks", {
      project_id: project.id,
      title: text(input.title, "Task title", 160),
      description: text(input.description || input.title, "Prompt", 16000),
      status: "draft",
      profile_id: choice(
        input.profile_id,
        ["mock-primary", "mock-backup"],
        project.default_profile_id,
      ),
      ...permissions(
        { ...input, tier: input.tier ?? project.default_tier },
        project,
      ),
      scenario: choice(input.scenario, SCENARIOS, "success"),
      priority: choice(input.priority, ["low", "normal", "high"], "normal"),
      pin_agent: Boolean(input.pin_agent),
      labels: [],
      timeout_sec: number(input.timeout_sec, 1, 7200, 1800),
      stall_timeout_sec: number(input.stall_timeout_sec, 1, 3600, 600),
    });
    const thread = this.s.put("threads", {
      project_id: project.id,
      task_id: task.id,
      profile_id: task.profile_id,
      status: "active",
      messages: [],
    });
    this.s.audit("task_created", { task_id: task.id, project_id: project.id });
    return { ...task, thread_id: thread.id };
  }
  schedule(input) {
    const project = this.s.get("projects", input.project_id);
    insist(!project.archived, "Project is archived.");
    const policy = permissions(
      { ...input, tier: input.tier ?? project.default_tier },
      project,
    );
    insist(
      policy.workspace_mode === "artifact_only",
      "Only artifact workspaces are executable in this development build.",
    );
    const timezone = text(
      input.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      "Timezone",
      100,
    );
    const expression = text(
      input.cron_expr || "0 8 * * *",
      "Cron expression",
      120,
    );
    const upcoming = nextDates(expression, timezone, new Date(this.clock()));
    const schedule = this.s.put("schedules", {
      project_id: project.id,
      name: text(input.name, "Schedule name", 120),
      prompt_template: text(input.prompt_template, "Prompt", 16000),
      cron_expr: expression,
      timezone,
      ...policy,
      status: "paused",
      version: 1,
      profile_id: choice(
        input.profile_id,
        ["mock-primary", "mock-backup"],
        "mock-primary",
      ),
      scenario: choice(input.scenario, SCENARIOS, "success"),
      concurrency_policy: choice(
        input.concurrency_policy,
        ["skip_if_running", "queue", "allow_parallel"],
        "skip_if_running",
      ),
      catch_up_policy: choice(
        input.catch_up_policy,
        ["skip", "run_once", "run_all"],
        "run_once",
      ),
      catch_up_max: 3,
      max_queue: 1,
      max_start_delay_min: number(input.max_start_delay_min, 1, 1440, 60),
      max_retries: number(input.max_retries, 0, 3, 2),
      retry_backoff_sec: number(input.retry_backoff_sec, 1, 3600, 300),
      timeout_sec: number(input.timeout_sec, 1, 7200, 1800),
      stall_timeout_sec: number(input.stall_timeout_sec, 1, 3600, 600),
      notify_policy: choice(
        input.notify_policy,
        ["on_failure", "on_change", "always", "never"],
        "on_failure",
      ),
      budget_daily_runs: number(input.budget_daily_runs, 1, 1000, 50),
      pin_agent: Boolean(input.pin_agent),
      destination_id: null,
      next_run_at: upcoming[0],
      consecutive_failures: 0,
      versions: [],
    });
    this.s.audit("schedule_created", { schedule_id: schedule.id, version: 1 });
    return schedule;
  }
  updateSchedule(id, input) {
    const old = this.s.get("schedules", id);
    insist(old.status !== "deleted", "Schedule is deleted.");
    const changes = {};
    for (const k of ["name", "prompt_template"])
      if (input[k] !== undefined)
        changes[k] = text(input[k], k, k === "name" ? 120 : 16000);
    if (input.scenario !== undefined)
      changes.scenario = choice(input.scenario, SCENARIOS);
    if (input.cron_expr || input.timezone) {
      changes.cron_expr = input.cron_expr || old.cron_expr;
      changes.timezone = input.timezone || old.timezone;
      changes.next_run_at = nextDates(
        changes.cron_expr,
        changes.timezone,
        new Date(this.clock()),
      )[0];
    }
    if (input.destination_id !== undefined) {
      if (input.destination_id)
        insist(
          this.s.get("destinations", input.destination_id).project_id ===
            old.project_id,
          "Destination belongs to another project.",
        );
      changes.destination_id = input.destination_id || null;
    }
    const version = old.version + 1,
      versions = [
        ...old.versions,
        {
          version: old.version,
          name: old.name,
          prompt_template: old.prompt_template,
          cron_expr: old.cron_expr,
          timezone: old.timezone,
          created_at: old.updated_at,
        },
      ];
    const result = this.s.put("schedules", {
      ...old,
      ...changes,
      version,
      versions,
    });
    this.s.audit("schedule_changed", { schedule_id: id, version });
    return result;
  }
  scheduleState(id, state, confirmed = false) {
    const s = this.s.get("schedules", id);
    insist(s.status !== "deleted", "Deleted schedules cannot be resumed.");
    choice(state, ["enabled", "paused", "deleted"]);
    if (state === "enabled") {
      insist(confirmed, "Confirm that this schedule may run automatically.");
      insist(
        !this.s.get("projects", s.project_id).archived,
        "Restore the project first.",
      );
      insist(!this.stopped(), "Resume from emergency stop first.");
      this.resolve(`schedule:${id}`);
    }
    const updated = this.s.put("schedules", {
      ...s,
      status: state,
      ...(state === "enabled"
        ? {
            next_run_at: nextDates(
              s.cron_expr,
              s.timezone,
              new Date(this.clock()),
            )[0],
            consecutive_failures: 0,
          }
        : {}),
    });
    if (state !== "enabled")
      for (const r of this.runs().filter(
        (r) =>
          r.schedule_id === id && ["pending", "deferred"].includes(r.status),
      ))
        this.finish(r, "cancelled", "Schedule was paused or deleted.");
    this.s.audit("schedule_state", { schedule_id: id, state });
    return updated;
  }
  enqueue({
    task_id,
    schedule_id,
    trigger = "manual",
    scheduled_for,
    attempt = 1,
    retry_of_run_id,
    failover_from_run_id,
    profile_id,
    answer,
    is_test = false,
  }) {
    insist(!this.stopped(), "Emergency stop is active.", 409);
    const source = this.s.get(
      task_id ? "tasks" : "schedules",
      task_id || schedule_id,
    );
    insist(
      source.status !== "deleted" && source.status !== "archived",
      "This item is archived or deleted.",
    );
    const project = this.s.get("projects", source.project_id);
    insist(!project.archived, "Project is archived.");
    const profile = this.s.get("profiles", profile_id || source.profile_id);
    insist(
      project.allowed_providers.includes(
        `${profile.provider}:${profile.auth_mode}`,
      ),
      "Provider has not been approved.",
      403,
    );
    const thread = task_id
      ? this.s
          .all("threads")
          .find((t) => t.task_id === task_id && t.profile_id === profile.id)
      : null;
    const run = this.s.put("runs", {
      project_id: project.id,
      task_id: task_id || null,
      schedule_id: schedule_id || null,
      thread_id: thread?.id || null,
      profile_id: profile.id,
      agent_id: profile.agent_id,
      agent_version: "mock-1.0",
      model: profile.model,
      auth_mode: profile.auth_mode,
      title: source.title || source.name,
      ...permissions(source, project),
      pin_agent: source.pin_agent,
      scenario: source.scenario,
      status: "pending",
      trigger,
      scheduled_for:
        scheduled_for ||
        (schedule_id ? new Date(this.clock()).toISOString() : null),
      attempt,
      retry_of_run_id: retry_of_run_id || null,
      failover_from_run_id: failover_from_run_id || null,
      schedule_version: schedule_id ? source.version : null,
      schedule_snapshot: schedule_id ? source : null,
      queued_at: new Date(this.clock()).toISOString(),
      ready_at: new Date(this.clock()).toISOString(),
      timeout_sec: source.timeout_sec,
      stall_timeout_sec: source.stall_timeout_sec,
      is_mock: profile.agent_id === "mock",
      is_test: Boolean(is_test),
      tainted: source.capabilities.includes("U"),
      tokens_in: null,
      tokens_out: null,
      cost_usd: null,
      usage_source: "unknown",
      answer: answer ? text(answer, "Answer", 4000) : null,
      summary: null,
    });
    const busy = this.runs().filter(
      (r) =>
        r.id !== run.id &&
        (schedule_id ? r.schedule_id === schedule_id : r.task_id === task_id) &&
        ["pending", "preparing", "running"].includes(r.status),
    );
    if (
      busy.length &&
      (task_id || source.concurrency_policy === "skip_if_running")
    )
      return this.finish(run, "skipped", "Another run is already active.");
    if (
      source.concurrency_policy === "queue" &&
      busy.filter((r) => r.status === "pending").length >= source.max_queue
    )
      return this.finish(run, "skipped", "Schedule queue is full.");
    if (task_id) this.s.put("tasks", { ...source, status: "queued" });
    this.s.audit("run_queued", {
      run_id: run.id,
      project_id: run.project_id,
      trigger,
      tier: run.tier,
    });
    this.emit("change");
    return run;
  }
  stopped() {
    return existsSync(join(this.s.dir, "STOP"));
  }
  pause(value) {
    this.s.setting("paused", value, true);
    if (!value)
      for (const s of this.s
        .all("schedules")
        .filter((s) => s.status === "enabled"))
        this.s.put("schedules", {
          ...s,
          next_run_at: nextDates(
            s.cron_expr,
            s.timezone,
            new Date(this.clock()),
          )[0],
        });
    this.s.audit("global_pause", { paused: value });
  }
  stopAll() {
    writeFileSync(join(this.s.dir, "STOP"), "Emergency stop\n", {
      mode: 0o600,
    });
    this.s.setting("paused", true, true);
    for (const c of this.active.values()) c.abort();
    for (const r of this.runs().filter((r) => !terminal.includes(r.status)))
      this.finish(r, "cancelled", "Emergency stop.");
    for (const a of this.s
      .all("approvals")
      .filter((a) => a.status === "pending"))
      this.s.put("approvals", { ...a, status: "expired" });
    for (const p of this.s.all("projects"))
      if (p.failover_policy.enabled)
        this.s.put("projects", {
          ...p,
          failover_policy: { ...p.failover_policy, enabled: false },
        });
    this.s.audit("emergency_stop");
    this.emit("change");
  }
  resume() {
    if (this.stopped()) unlinkSync(join(this.s.dir, "STOP"));
    this.pause(false);
    this.s.audit("emergency_resume");
  }
  setFailover(projectId, input) {
    const p = this.s.get("projects", projectId);
    insist(!p.sensitive, "Sensitive projects cannot switch providers.");
    insist(
      input.confirmed,
      "Confirm the ordered profiles before enabling switching.",
    );
    insist(
      Array.isArray(input.ordered_profile_ids) &&
        input.ordered_profile_ids.length >= 2 &&
        new Set(input.ordered_profile_ids).size ===
          input.ordered_profile_ids.length,
      "Choose at least two different profiles.",
    );
    for (const id of input.ordered_profile_ids) {
      const target = this.s.get("profiles", id);
      insist(
        target.agent_id === "mock" &&
          p.allowed_providers.includes(
            `${target.provider}:${target.auth_mode}`,
          ),
        "Only approved mock profiles are available in this build.",
      );
    }
    const policy = {
      enabled: input.enabled !== false,
      ordered_profile_ids: input.ordered_profile_ids,
      allow_paid: false,
      soft_threshold: 90,
    };
    this.s.audit("failover_policy_changed", { project_id: p.id, policy });
    return this.s.put("projects", { ...p, failover_policy: policy });
  }
  quota(profileId, raw) {
    const profile = this.s.get("profiles", profileId);
    insist(profile.agent_id === "mock", "Live quota injection is not allowed.");
    const previous = this.s
      .all("quotas")
      .find((q) => q.profile_id === profileId);
    const q = normalizeQuota(
      {
        ...raw,
        confidence: "mock",
        profile_id: profileId,
        source: "mock_fixture",
        id: previous?.id,
      },
      previous,
    );
    this.s.put("quotas", q);
    this.s.audit("mock_quota", {
      profile_id: profileId,
      status: q.status,
      used_pct: q.used_pct,
    });
    return q;
  }
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.heartbeat = now();
      if (this.stopped()) {
        if (
          this.active.size ||
          this.runs().some((r) => ["pending", "deferred"].includes(r.status))
        )
          this.stopAll();
        return;
      }
      const clock = this.clock();
      for (const i of this.s
        .all("inbox")
        .filter(
          (i) => i.state === "snoozed" && Date.parse(i.snooze_until) <= clock,
        ))
        this.s.put("inbox", { ...i, state: "open" });
      for (const a of this.s
        .all("approvals")
        .filter(
          (a) => a.status === "pending" && Date.parse(a.expires_at) <= clock,
        ))
        this.s.put("approvals", { ...a, status: "expired" });
      if (!this.s.setting("paused", false))
        for (const schedule of this.s
          .all("schedules")
          .filter(
            (s) => s.status === "enabled" && Date.parse(s.next_run_at) <= clock,
          )) {
          this.s.transaction(() => {
            const { due, next } = missedOccurrences(schedule, clock);
            this.s.put("schedules", { ...schedule, next_run_at: next });
            for (const occurrence of due)
              this.enqueue({
                schedule_id: schedule.id,
                trigger:
                  clock - Date.parse(occurrence) > 60000
                    ? "catch_up"
                    : "schedule",
                scheduled_for: occurrence,
              });
          });
        }
      for (const run of this.runs().filter((r) => r.status === "deferred")) {
        const q = this.s
          .all("quotas")
          .find((q) => q.profile_id === run.profile_id);
        const project = this.s.get("projects", run.project_id);
        const decision = selectProfile({
          source: this.s.get("profiles", run.profile_id),
          candidates: this.s.all("profiles"),
          policy: project.failover_policy,
          project,
          run,
          quotas: Object.fromEntries(
            this.s.all("quotas").map((q) => [q.profile_id, q]),
          ),
          clock,
        });
        if (
          run.schedule_id &&
          clock - Date.parse(run.queued_at) >
            run.schedule_snapshot.max_start_delay_min * 60000
        )
          this.finish(
            run,
            "skipped",
            "Deferred run exceeded its maximum start delay.",
          );
        else if (
          !quotaBlocked(q, Boolean(run.schedule_id), clock) ||
          decision.switched
        ) {
          this.s.put("runs", { ...run, status: "pending" });
          this.resolve(`quota:${run.profile_id}`);
        }
      }
      const pending = this.runs()
        .filter(
          (r) => r.status === "pending" && Date.parse(r.ready_at) <= clock,
        )
        .sort(
          (a, b) =>
            (a.task_id ? 0 : a.trigger === "retry" ? 1 : 2) -
              (b.task_id ? 0 : b.trigger === "retry" ? 1 : 2) ||
            a.queued_at.localeCompare(b.queued_at),
        );
      for (const run of pending) {
        if (this.active.size >= 4) break;
        if (run.schedule_id && this.s.setting("paused", false)) continue;
        const active = [...this.active.keys()].map((id) =>
          this.s.get("runs", id),
        );
        if (active.filter((r) => r.profile_id === run.profile_id).length >= 2)
          continue;
        if (
          run.schedule_id &&
          run.schedule_snapshot.concurrency_policy !== "allow_parallel" &&
          active.some((r) => r.schedule_id === run.schedule_id)
        )
          continue;
        if (
          run.schedule_id &&
          clock - Date.parse(run.queued_at) >
            run.schedule_snapshot.max_start_delay_min * 60000
        ) {
          this.finish(run, "skipped", "Maximum start delay exceeded.");
          continue;
        }
        const project = this.s.get("projects", run.project_id),
          profile = this.s.get("profiles", run.profile_id);
        if (project.archived) {
          this.finish(run, "cancelled", "Project archived.");
          continue;
        }
        const counted = this.runs().filter(
          (r) => !r.is_test && r.started_at && r.status !== "skipped",
        );
        const today = new Date(clock).toISOString().slice(0, 10);
        if (
          !run.is_test &&
          (counted.filter((r) => r.started_at.startsWith(today)).length >=
            this.s.setting("daily_run_limit", 100) ||
            counted.filter(
              (r) =>
                r.project_id === run.project_id &&
                r.started_at.slice(0, 7) === today.slice(0, 7),
            ).length >= project.budget_monthly_runs ||
            (run.schedule_id &&
              counted.filter(
                (r) =>
                  r.schedule_id === run.schedule_id &&
                  r.started_at.startsWith(today),
              ).length >= run.schedule_snapshot.budget_daily_runs))
        ) {
          this.finish(run, "skipped", "Run budget reached.");
          if (run.schedule_id)
            this.s.put("schedules", {
              ...this.s.get("schedules", run.schedule_id),
              status: "auto_paused",
            });
          this.notify({
            project_id: run.project_id,
            type: "budget_alert",
            severity: "critical",
            title: "Run budget reached",
            body: "Increase the limit or wait for the next budget window.",
            dedupe_key: `budget:${today}`,
            ref_id: run.id,
          });
          continue;
        }
        const quotas = Object.fromEntries(
          this.s.all("quotas").map((q) => [q.profile_id, q]),
        );
        const switches = this.s
          .all("failovers")
          .filter(
            (f) =>
              f.schedule_id === run.schedule_id &&
              f.project_id === run.project_id &&
              clock - Date.parse(f.created_at) < 86400000,
          ).length;
        const decision = selectProfile({
          source: profile,
          candidates: this.s.all("profiles"),
          policy: project.failover_policy,
          project,
          run,
          quotas,
          clock,
          switches,
        });
        if (!decision.profile) {
          this.s.put("runs", {
            ...run,
            status: "deferred",
            error_type: "quota_exhausted",
            error_message: decision.reason,
          });
          this.notify({
            project_id: run.project_id,
            type: "quota_warning",
            severity: "critical",
            title: "Run waiting for quota",
            body: decision.reason,
            dedupe_key: `quota:${profile.id}`,
            ref_id: run.id,
          });
          if (decision.storm && run.schedule_id)
            this.s.put("schedules", {
              ...this.s.get("schedules", run.schedule_id),
              status: "auto_paused",
            });
          continue;
        }
        if (decision.switched) {
          this.finish(
            run,
            "failed",
            "Quota exhausted; continuing in a new run.",
            "quota_exhausted",
            false,
          );
          if (
            run.task_id &&
            !this.s
              .all("threads")
              .some(
                (t) =>
                  t.task_id === run.task_id &&
                  t.profile_id === decision.profile.id,
              )
          )
            this.s.put("threads", {
              project_id: run.project_id,
              task_id: run.task_id,
              profile_id: decision.profile.id,
              status: "active",
              messages: [],
            });
          const next = this.enqueue({
            task_id: run.task_id,
            schedule_id: run.schedule_id,
            trigger: "failover",
            scheduled_for: run.scheduled_for,
            attempt: run.attempt + 1,
            failover_from_run_id: run.id,
            profile_id: decision.profile.id,
            is_test: run.is_test,
          });
          // A backup scenario is independent from the primary fixture's quota response.
          this.s.put("runs", { ...next, scenario: "success" });
          const event = {
            project_id: run.project_id,
            schedule_id: run.schedule_id,
            run_id: next.id,
            from_profile_id: run.profile_id,
            to_profile_id: next.profile_id,
            reason: "quota_exhausted",
            signal_source: "mock_fixture",
            from_tier: run.tier,
            to_tier: next.tier,
            from_argv_hash: sha(tierToArgs(profile.agent_id, run)),
            to_argv_hash: decision.argv_hash,
            context_hash: sha(""),
            context_bytes: 0,
          };
          this.s.put("failovers", event);
          this.s.audit("provider_switch", event);
          if (!run.is_test)
            this.notify({
              project_id: run.project_id,
              type: "failover_switched",
              severity: "warning",
              title: "Mock quota reached · switched to backup",
              body: "A new run uses the approved backup with the same permissions. No data left this machine.",
              dedupe_key: `failover:${profile.id}:${quotas[profile.id]?.resets_at || today}`,
              ref_id: next.id,
            });
          continue;
        }
        if (
          !profile.enabled ||
          profile.agent_id !== "mock" ||
          !profile.sandbox_verified
        ) {
          this.finish(
            run,
            "failed",
            "Real-agent isolation has not passed the M0 security gate.",
            "sandbox_unavailable",
          );
          continue;
        }
        const ctl = new AbortController();
        this.active.set(run.id, ctl);
        this.work ||= new Set();
        const work = this.execute(run, ctl)
          .catch((e) =>
            this.finish(
              this.s.get("runs", run.id),
              "failed",
              e.message,
              "unknown",
            ),
          )
          .finally(() => {
            this.active.delete(run.id);
            this.work.delete(work);
            this.emit("change");
          });
        this.work.add(work);
      }
    } finally {
      this.ticking = false;
    }
  }
  async execute(input, ctl) {
    const source = input.task_id
      ? this.s.get("tasks", input.task_id)
      : input.schedule_snapshot;
    const previous = this.runs().filter(
      (r) =>
        r.id !== input.id &&
        (input.task_id
          ? r.task_id === input.task_id
          : r.schedule_id === input.schedule_id) &&
        r.summary,
    );
    const context = contextFor({
      prompt: input.answer || source.description || source.prompt_template,
      memories: this.s.all("memories", input.project_id),
      previous,
      run: input,
      clock: new Date(this.clock()),
    });
    const workspace = join(this.s.dir, "workspaces", input.id);
    mkdirSync(workspace, { mode: 0o700, recursive: true });
    const argv = tierToArgs("mock", input);
    let run = this.s.put("runs", {
      ...input,
      status: "running",
      started_at: new Date(this.clock()).toISOString(),
      prompt_final: redact(context.prompt),
      context_sources: context.sources,
      workspace_id: input.id,
      argv_redacted: argv,
      sandbox_config_hash: sha({
        mode: "in-process-scripted-mock",
        permissions: permissions(input),
      }),
      summary: null,
    });
    if (run.task_id)
      this.s.put("tasks", {
        ...this.s.get("tasks", run.task_id),
        status: "running",
      });
    this.s.audit("run_started", {
      run_id: run.id,
      tier: run.tier,
      capabilities: run.capabilities,
      argv,
      env_names: [],
      agent_version: run.agent_version,
      sandbox_config_hash: run.sandbox_config_hash,
    });
    let elapsed = 0,
      silence = 0,
      last = performance.now(),
      timeoutType;
    const timer = setInterval(() => {
      const t = performance.now(),
        dt = t - last;
      last = t;
      if (dt < 120000) {
        elapsed += dt;
        silence += dt;
      }
      if (
        elapsed > run.timeout_sec * 1000 ||
        silence > run.stall_timeout_sec * 1000
      ) {
        timeoutType = elapsed > run.timeout_sec * 1000 ? "timeout" : "stalled";
        ctl.abort();
      }
    }, 100);
    try {
      for await (const event of mockEvents(run, {
        signal: ctl.signal,
        delay: this.delay,
      })) {
        if (ctl.signal.aborted) break;
        silence = 0;
        const recorded = this.s.event(run.id, event.type, event.payload);
        if (recorded) this.emit("event", recorded);
        if (event.type === "error") {
          this.failed(run, event.payload.error_type, event.payload.message);
          return;
        }
        if (event.type === "rate_limit") {
          this.quota(run.profile_id, event.payload);
          this.s.put("runs", {
            ...this.s.get("runs", run.id),
            status: "deferred",
            error_type: "quota_exhausted",
            summary: summary(
              "Mock quota check.",
              "Quota rejected.",
              "Waiting for a reset or approved fallback.",
            ),
          });
          return;
        }
        if (event.type === "done") {
          const folder = join(this.s.dir, "artifacts", run.id);
          mkdirSync(folder, { mode: 0o700 });
          const content = event.payload.content;
          writeFileSync(join(folder, "output.md"), content, {
            mode: 0o600,
            flag: "wx",
          });
          const artifact = this.s.put("artifacts", {
            project_id: run.project_id,
            run_id: run.id,
            schedule_id: run.schedule_id,
            filename: "output.md",
            title: run.title,
            path: `${run.id}/output.md`,
            bytes: Buffer.byteLength(content),
            sha256: sha(content),
            mime: "text/markdown",
            tainted: run.tainted,
            starred: false,
            archived: false,
            is_mock: true,
            is_test: run.is_test,
          });
          run = this.s.put("runs", {
            ...this.s.get("runs", run.id),
            status: "succeeded",
            finished_at: now(),
            duration_ms: Math.round(elapsed),
            summary: event.payload.summary,
            output_ref: artifact.id,
            needs_input: event.payload.needs_input,
            notable: event.payload.notable,
          });
          this.s.audit("run_succeeded", {
            run_id: run.id,
            artifact_id: artifact.id,
          });
          if (run.task_id)
            this.s.put("tasks", {
              ...this.s.get("tasks", run.task_id),
              status: run.needs_input ? "awaiting_input" : "done",
            });
          if (run.needs_input && !run.is_test) {
            if (!run.task_id) {
              const promoted = this.promote(run.id);
              this.s.put("tasks", { ...promoted, status: "awaiting_input" });
              run = this.s.put("runs", {
                ...run,
                escalated_task_id: promoted.id,
              });
            }
            this.notify({
              project_id: run.project_id,
              type: "input_needed",
              severity: "action",
              title: run.title,
              body: run.needs_input.question,
              options: run.needs_input.options,
              dedupe_key: `input:${run.task_id || run.escalated_task_id}`,
              ref_id: run.id,
            });
          }
          if (run.schedule_id) {
            const s = this.s.get("schedules", run.schedule_id);
            this.s.put("schedules", {
              ...s,
              last_run_at: now(),
              last_status: "succeeded",
              consecutive_failures: 0,
            });
            this.resolve(`failure:${s.id}`);
          }
          if (run.task_id) this.resolve(`failure:${run.task_id}`);
          if (
            !run.is_test &&
            !run.needs_input &&
            (run.notable ||
              source.notify_policy === "always" ||
              (source.notify_policy === "on_change" &&
                previous.find((r) => r.output_ref) &&
                this.s.get(
                  "artifacts",
                  previous.find((r) => r.output_ref).output_ref,
                ).sha256 !== artifact.sha256)) &&
            source.notify_policy !== "never"
          )
            this.notify({
              project_id: run.project_id,
              type: "notable_result",
              severity: "info",
              title: run.title,
              body: event.payload.summary.result,
              dedupe_key: `notable:${run.schedule_id || run.task_id}`,
              ref_id: run.id,
            });
          if (source.destination_id && !run.is_test)
            this.requestDelivery(run, artifact, source.destination_id);
          this.emit("change");
          return;
        }
      }
      this.finish(
        this.s.get("runs", run.id),
        "cancelled",
        "Stopped by the user.",
      );
    } catch (e) {
      if (timeoutType)
        this.failed(run, timeoutType, `Mock run ${timeoutType}.`);
      else if (ctl.signal.aborted)
        this.finish(
          this.s.get("runs", run.id),
          "cancelled",
          "Stopped by the user.",
        );
      else throw e;
    } finally {
      clearInterval(timer);
    }
  }
  failed(run, type, message) {
    const retry =
      run.schedule_id &&
      retryable.includes(type) &&
      run.attempt <= run.schedule_snapshot.max_retries &&
      !run.is_test;
    this.finish(
      run,
      type === "timeout" || type === "stalled" ? "timed_out" : "failed",
      message,
      type,
      !retry,
    );
    if (retry) {
      const next = this.enqueue({
        schedule_id: run.schedule_id,
        trigger: "retry",
        scheduled_for: run.scheduled_for,
        attempt: run.attempt + 1,
        retry_of_run_id: run.id,
      });
      this.s.put("runs", {
        ...next,
        ready_at: new Date(
          this.clock() +
            run.schedule_snapshot.retry_backoff_sec *
              1000 *
              2 ** (run.attempt - 1),
        ).toISOString(),
      });
    } else if (run.schedule_id && !run.is_test && type !== "quota_exhausted") {
      const s = this.s.get("schedules", run.schedule_id),
        failures = s.consecutive_failures + 1;
      this.s.put("schedules", {
        ...s,
        consecutive_failures: failures,
        ...(failures >= 3 ? { status: "auto_paused" } : {}),
      });
      if (failures >= 3)
        this.notify({
          project_id: run.project_id,
          type: "schedule_paused",
          severity: "critical",
          title: "Schedule paused after repeated failures",
          body: run.title,
          dedupe_key: `schedule:${s.id}`,
          ref_id: run.id,
        });
    }
  }
  finish(input, status, message, type = null, notify = true) {
    const current = this.s.get("runs", input.id);
    if (terminal.includes(current.status)) return current;
    const run = this.s.put("runs", {
      ...current,
      status,
      error_type: type,
      error_message: redact(message),
      finished_at: now(),
      summary: summary(
        current.title || "Run ended.",
        message,
        status === "succeeded"
          ? "Review the output."
          : "Review the run details before trying again.",
      ),
    });
    if (run.task_id)
      this.s.put("tasks", {
        ...this.s.get("tasks", run.task_id),
        status:
          status === "cancelled"
            ? "cancelled"
            : status === "skipped"
              ? this.s.get("tasks", run.task_id).status
              : "failed",
      });
    this.s.audit("run_finished", { run_id: run.id, status, error_type: type });
    if (
      notify &&
      !run.is_test &&
      ["failed", "timed_out", "interrupted"].includes(status)
    )
      this.notify({
        project_id: run.project_id,
        type: type === "sandbox_unavailable" ? "security_alert" : "run_failed",
        severity: type === "sandbox_unavailable" ? "critical" : "action",
        title: run.title,
        body: message,
        dedupe_key: `failure:${run.schedule_id || run.task_id}`,
        ref_id: run.id,
      });
    this.emit("change");
    return run;
  }
  cancel(id) {
    const r = this.s.get("runs", id);
    this.active.get(id)?.abort();
    return this.finish(r, "cancelled", "Stopped by the user.");
  }
  promote(id) {
    const r = this.s.get("runs", id);
    const task = this.task({
      project_id: r.project_id,
      title: r.title,
      description: r.prompt_final || r.title,
      scenario: r.scenario,
      tier: r.tier,
      capabilities: r.capabilities,
      network_allowlist: r.network_allowlist,
    });
    return this.s.put("tasks", {
      ...task,
      origin: r.schedule_id ? "schedule_escalation" : "promoted_from_run",
      origin_ref: r.id,
    });
  }
  answer(id, value) {
    const r = this.s.get("runs", id);
    insist(r.needs_input, "This run is not waiting for input.");
    const taskId = r.task_id || r.escalated_task_id;
    insist(taskId, "No task found.");
    const next = this.enqueue({ task_id: taskId, answer: value });
    this.resolve(`input:${taskId}`);
    this.s.audit("input_answered", { run_id: id, task_id: taskId });
    return next;
  }
  memory(projectId, input) {
    this.s.get("projects", projectId);
    const m = this.s.put("memories", {
      project_id: projectId,
      content: text(input.content, "Memory", 4000),
      kind: choice(
        input.kind,
        ["note", "fact", "decision", "glossary"],
        "note",
      ),
      status: "active",
      pinned: input.pinned !== false,
      tainted: false,
      tier: 0,
      version: 1,
    });
    this.s.audit("memory_created", { project_id: projectId, memory_id: m.id });
    return m;
  }
  inboxAction(ids, action) {
    insist(
      Array.isArray(ids) && ids.length > 0 && ids.length <= 100,
      "Select 1–100 items.",
    );
    choice(action, ["dismiss", "resolve", "snooze"]);
    const before = ids.map((id) => this.s.get("inbox", id));
    this.s.transaction(() => {
      for (const i of before)
        this.s.put("inbox", {
          ...i,
          state: {
            dismiss: "dismissed",
            resolve: "resolved",
            snooze: "snoozed",
          }[action],
          snooze_until:
            action === "snooze"
              ? new Date(this.clock() + 3600000).toISOString()
              : null,
        });
      this.s.audit("inbox_batch", { ids, action });
    });
    const undoId = randomUUID();
    this.undo = { id: undoId, expires: this.clock() + 10000, before };
    return { undo_id: undoId };
  }
  undoInbox(id) {
    insist(
      this.undo?.id === id && this.undo.expires >= this.clock(),
      "Undo has expired.",
    );
    for (const i of this.undo.before) this.s.put("inbox", i);
    this.undo = null;
    this.s.audit("inbox_undo");
  }
  archive(projectId, archived) {
    const p = this.s.get("projects", projectId);
    for (const s of this.s
      .all("schedules", p.id)
      .filter((s) => s.status === "enabled"))
      this.scheduleState(s.id, "paused");
    for (const r of this.runs().filter(
      (r) => r.project_id === p.id && !terminal.includes(r.status),
    ))
      this.cancel(r.id);
    this.s.audit("project_archive", { project_id: p.id, archived });
    return this.s.put("projects", {
      ...p,
      archived,
      archived_at: archived ? now() : null,
    });
  }
  cleanup(id) {
    const r = this.s.get("runs", id);
    insist(
      terminal.includes(r.status),
      "Stop this run before cleaning its workspace.",
    );
    rmSync(join(this.s.dir, "workspaces", r.id), {
      recursive: true,
      force: true,
    });
    this.s.audit("workspace_cleaned", { run_id: id });
    return this.s.put("runs", { ...r, workspace_cleaned: true });
  }
  destination(projectId, input) {
    this.s.get("projects", projectId);
    const path = safeProjectPath(input.path, this.s.dir);
    const stat = lstatSync(path);
    const d = this.s.put("destinations", {
      project_id: projectId,
      name: text(input.name, "Destination name", 100),
      path,
      dev: stat.dev,
      ino: stat.ino,
      kind: "folder",
      require_approval: true,
    });
    this.s.audit("destination_created", {
      destination_id: d.id,
      project_id: projectId,
    });
    return d;
  }
  requestDelivery(run, artifact, destinationId) {
    const d = this.s.get("destinations", destinationId);
    insist(
      d.project_id === run.project_id,
      "Destination belongs to another project.",
    );
    const existing = this.s
      .all("deliveries")
      .find((x) => x.idempotency_key === `${run.id}:${d.id}`);
    if (existing) return existing;
    const hash = sha(`${artifact.sha256}:${d.path}:${run.id}`);
    const a = this.s.put("approvals", {
      project_id: run.project_id,
      run_id: run.id,
      artifact_id: artifact.id,
      destination_id: d.id,
      action_type: "deliver",
      content_hash: hash,
      status: "pending",
      expires_at: new Date(this.clock() + 7 * 86400000).toISOString(),
    });
    const delivery = this.s.put("deliveries", {
      project_id: run.project_id,
      run_id: run.id,
      artifact_id: artifact.id,
      destination_id: d.id,
      approval_id: a.id,
      status: "pending_approval",
      idempotency_key: `${run.id}:${d.id}`,
    });
    this.notify({
      project_id: run.project_id,
      type: "delivery_pending",
      severity: "action",
      title: "Output ready for local delivery",
      body: `Review output before writing to ${d.path}`,
      dedupe_key: `delivery:${delivery.id}`,
      ref_id: run.id,
      approval_id: a.id,
    });
    return delivery;
  }
  approve(id, hash) {
    insist(!this.stopped(), "Emergency stop is active.");
    const a = this.s.get("approvals", id);
    insist(
      a.status === "pending" && Date.parse(a.expires_at) > this.clock(),
      "Approval is unavailable or expired.",
      409,
    );
    const artifact = this.s.get("artifacts", a.artifact_id),
      d = this.s.get("destinations", a.destination_id),
      content = readSafe(join(this.s.dir, "artifacts"), artifact.path);
    const actual = sha(`${sha(content)}:${d.path}:${a.run_id}`);
    insist(
      hash === a.content_hash && actual === a.content_hash,
      "Content changed; request a new approval.",
      409,
    );
    const canonical = realpathSync(d.path),
      stat = lstatSync(d.path);
    insist(
      canonical === d.path &&
        stat.dev === d.dev &&
        stat.ino === d.ino &&
        !stat.isSymbolicLink(),
      "Destination changed; recreate it.",
      409,
    );
    const filename = `${a.run_id}.md`,
      path = join(d.path, filename);
    const delivery = this.s
      .all("deliveries")
      .find((x) => x.approval_id === a.id);
    try {
      if (existsSync(path))
        insist(
          sha(readSafe(d.path, filename)) === artifact.sha256,
          "Destination file already exists with different content.",
          409,
        );
      else {
        const fd = openSync(
          path,
          constants.O_WRONLY |
            constants.O_CREAT |
            constants.O_EXCL |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          insist(fstatSync(fd).isFile(), "Destination must be a regular file.");
          writeFileSync(fd, content);
        } finally {
          closeSync(fd);
        }
      }
      this.s.put("approvals", { ...a, status: "approved", decided_at: now() });
      this.s.put("deliveries", {
        ...delivery,
        status: "sent",
        external_ref: path,
      });
      this.resolve(`delivery:${delivery.id}`);
      this.s.audit("delivery_sent", {
        approval_id: a.id,
        content_hash: a.content_hash,
        destination_id: d.id,
      });
      return { status: "sent", path };
    } catch (e) {
      this.s.put("deliveries", { ...delivery, status: "failed" });
      throw e;
    }
  }
  demo() {
    const previous = this.s.setting("demo_project");
    if (previous) {
      try {
        return this.s.get("projects", previous);
      } catch {}
    }
    const p = this.project({
      name: "Launch notes",
      description: "A local playground for your first agent workflows.",
    });
    this.s.setting("demo_project", p.id, true);
    this.memory(p.id, {
      content:
        "Write concise updates. Cite sources when available. Clearly distinguish facts from assumptions.",
      kind: "decision",
    });
    const success = this.task({
      project_id: p.id,
      title: "Prepare the weekly project brief",
      description:
        "Summarize what shipped, what needs attention, and the next steps.",
      scenario: "success",
    });
    this.enqueue({ task_id: success.id });
    const input = this.task({
      project_id: p.id,
      title: "Choose a release-note format",
      description: "Prepare release notes for the next update.",
      scenario: "needs_input",
    });
    this.enqueue({ task_id: input.id });
    this.schedule({
      project_id: p.id,
      name: "Morning project digest",
      prompt_template:
        "Prepare a project digest for {{date}}.\n{{project_memory}}",
      cron_expr: "0 8 * * 1-5",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    return p;
  }
}
