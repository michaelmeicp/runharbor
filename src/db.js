import { migrate } from "./migrations.js";
import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  chmodSync,
  existsSync,
  lstatSync,
  realpathSync,
} from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { sha, redact, insist } from "./security.js";

export const tables = [
  "projects",
  "tasks",
  "threads",
  "schedules",
  "runs",
  "inbox",
  "artifacts",
  "memories",
  "profiles",
  "quotas",
  "failovers",
  "approvals",
  "destinations",
  "deliveries",
];
export const now = () => new Date().toISOString();
export class Store {
  constructor(dir) {
    this.dir = resolve(dir);
    if (existsSync(this.dir))
      insist(
        !lstatSync(this.dir).isSymbolicLink(),
        "Data directory must not be a symlink.",
      );
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    chmodSync(this.dir, 0o700);
    this.dir = realpathSync(this.dir);
    for (const name of ["artifacts", "workspaces", "backups"]) {
      mkdirSync(resolve(this.dir, name), { mode: 0o700, recursive: true });
      chmodSync(resolve(this.dir, name), 0o700);
    }
    const path = resolve(this.dir, "runharbor.db");
    if (existsSync(path))
      insist(
        !lstatSync(path).isSymbolicLink(),
        "Database must not be a symlink.",
      );
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    try {
      migrate(this.db);
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;",
      );
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  setting(key, fallback = null, write = false) {
    if (write) {
      this.db
        .prepare(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(key, JSON.stringify(fallback));
      return fallback;
    }
    const row = this.db
      .prepare("SELECT value FROM settings WHERE key=?")
      .get(key);
    return row ? JSON.parse(row.value) : fallback;
  }
  all(kind, projectId, limit = 1000) {
    insist(tables.includes(kind), "Unknown collection.");
    return this.db
      .prepare(
        `SELECT body FROM entities WHERE kind=? ${projectId ? "AND project_id=?" : ""} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...[kind, ...(projectId ? [projectId] : []), limit])
      .map((r) => JSON.parse(r.body));
  }
  get(kind, id) {
    const row = this.db
      .prepare("SELECT body FROM entities WHERE kind=? AND id=?")
      .get(kind, id);
    insist(row, "Item not found.", 404);
    return JSON.parse(row.body);
  }
  put(kind, input) {
    insist(tables.includes(kind), "Unknown collection.");
    const previous = input.id
      ? this.db
          .prepare("SELECT body FROM entities WHERE id=? AND kind=?")
          .get(input.id, kind)
      : null;
    const obj = {
      ...(previous ? JSON.parse(previous.body) : {}),
      ...input,
      id: input.id || randomUUID(),
      updated_at: now(),
    };
    obj.created_at ||= now();
    if (kind === "runs") {
      insist(
        Boolean(obj.task_id) !== Boolean(obj.schedule_id),
        "Run must belong to exactly one task or schedule.",
      );
      insist(
        !obj.thread_id || obj.task_id,
        "A thread run must belong to a task.",
      );
    }
    // Only free text is redacted; identifiers and hashes must remain stable.
    for (const key of [
      "name",
      "title",
      "description",
      "prompt_template",
      "prompt_final",
      "content",
      "body",
      "error_message",
    ])
      if (typeof obj[key] === "string") obj[key] = redact(obj[key]);
    this.db
      .prepare(
        "INSERT INTO entities VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at, body=excluded.body, project_id=excluded.project_id",
      )
      .run(
        kind,
        obj.id,
        obj.project_id || null,
        obj.created_at,
        obj.updated_at,
        JSON.stringify(obj),
      );
    this.db.prepare("DELETE FROM search WHERE id=?").run(obj.id);
    const searchable =
      [
        "title",
        "name",
        "description",
        "content",
        "prompt_final",
        "prompt_template",
        "filename",
      ]
        .map((k) => obj[k] || "")
        .join("\n") +
      "\n" +
      JSON.stringify(obj.summary || "");
    this.db
      .prepare("INSERT INTO search(id,kind,content) VALUES(?,?,?)")
      .run(obj.id, kind, redact(searchable));
    return obj;
  }
  delete(kind, id) {
    this.db.prepare("DELETE FROM entities WHERE kind=? AND id=?").run(kind, id);
    this.db.prepare("DELETE FROM search WHERE id=?").run(id);
  }
  audit(type, payload = {}) {
    const previous =
      this.db.prepare("SELECT hash FROM audit ORDER BY seq DESC LIMIT 1").get()
        ?.hash || "GENESIS";
    const ts = now(),
      body = JSON.stringify(this.clean(payload));
    const hash = sha(`${previous}\n${ts}\n${type}\n${body}`);
    this.db
      .prepare(
        "INSERT INTO audit(ts,type,payload,previous,hash) VALUES(?,?,?,?,?)",
      )
      .run(ts, type, body, previous, hash);
    return hash;
  }
  clean(value) {
    if (typeof value === "string") return redact(value);
    if (Array.isArray(value)) return value.map((v) => this.clean(v));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, this.clean(v)]),
      );
    return value;
  }
  auditRows(limit = 200) {
    return this.db
      .prepare("SELECT * FROM audit ORDER BY seq DESC LIMIT ?")
      .all(limit)
      .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }
  verifyAudit() {
    let previous = "GENESIS",
      count = 0;
    for (const r of this.db
      .prepare("SELECT * FROM audit ORDER BY seq")
      .iterate()) {
      if (
        r.previous !== previous ||
        sha(`${previous}\n${r.ts}\n${r.type}\n${r.payload}`) !== r.hash
      )
        return { valid: false, break_at: r.seq, count };
      previous = r.hash;
      count++;
    }
    return { valid: true, count, head: previous };
  }
  event(runId, type, payload) {
    const body = JSON.stringify(this.clean(payload));
    insist(Buffer.byteLength(body) < 65536, "Event too large.");
    const size = this.db
      .prepare(
        "SELECT COALESCE(SUM(length(payload)),0) AS size FROM events WHERE run_id=?",
      )
      .get(runId).size;
    if (size + Buffer.byteLength(body) > 50 * 1024 * 1024) return null;
    const ts = now();
    const r = this.db
      .prepare("INSERT INTO events(run_id,ts,type,payload) VALUES(?,?,?,?)")
      .run(runId, ts, type, body);
    return {
      seq: Number(r.lastInsertRowid),
      run_id: runId,
      ts,
      type,
      payload: JSON.parse(body),
    };
  }
  events(runId, after = 0) {
    return this.db
      .prepare(
        "SELECT * FROM events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 1000",
      )
      .all(runId, after)
      .map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
  }
  find(query) {
    const q = query.trim().slice(0, 200);
    if (!q) return [];
    const rows =
      [...q].length < 3
        ? this.db
            .prepare(
              "SELECT id,kind,content FROM search WHERE content LIKE ? ESCAPE '\\' LIMIT 60",
            )
            .all("%" + q.replace(/[\\%_]/g, "\\$&") + "%")
        : this.db
            .prepare(
              "SELECT id,kind,content FROM search WHERE search MATCH ? LIMIT 60",
            )
            .all('"' + q.replaceAll('"', '""') + '"');
    return rows.map((r) => ({ ...r, content: r.content.slice(0, 300) }));
  }
}
