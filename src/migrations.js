import { createHash } from "node:crypto";

// Append migrations; never edit an applied migration. All pending DDL and version
// changes commit together. SQLite rolls back interrupted/failed migrations.
export const migrations = [
  {
    version: 1,
    name: "initial-entity-store",
    sql: `CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS entities(kind TEXT NOT NULL, id TEXT PRIMARY KEY, project_id TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, body TEXT NOT NULL CHECK(json_valid(body)));
      CREATE INDEX IF NOT EXISTS entities_kind_time ON entities(kind, created_at DESC);
      CREATE INDEX IF NOT EXISTS entities_project ON entities(project_id, kind);
      CREATE UNIQUE INDEX IF NOT EXISTS schedule_occurrence ON entities(json_extract(body,'$.schedule_id'), json_extract(body,'$.scheduled_for'), json_extract(body,'$.attempt')) WHERE kind='runs' AND json_extract(body,'$.trigger') IN ('schedule','catch_up','retry');
      CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, ts TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_run ON events(run_id,seq);
      CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, type TEXT NOT NULL, payload TEXT NOT NULL, previous TEXT NOT NULL, hash TEXT NOT NULL);
      CREATE VIRTUAL TABLE IF NOT EXISTS search USING fts5(id UNINDEXED, kind UNINDEXED, content, tokenize='trigram');
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'append-only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'append-only'); END;`,
  },
  {
    version: 2,
    name: "migration-ledger",
    sql: `
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL);
    CREATE INDEX entities_kind_updated ON entities(kind, updated_at DESC);
  `,
  },
];
const digest = (sql) => createHash("sha256").update(sql).digest("hex");

export function migrate(db, steps = migrations) {
  if (!steps.length || steps.some((m, i) => m.version !== i + 1))
    throw new Error("Migrations must be contiguous and start at version 1.");
  db.exec("PRAGMA busy_timeout=5000; BEGIN IMMEDIATE");
  try {
    const hasSettings = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='settings'",
      )
      .get();
    const raw =
      hasSettings &&
      db.prepare("SELECT value FROM settings WHERE key='schema_version'").get();
    const version = raw ? JSON.parse(raw.value) : 0;
    if (!Number.isSafeInteger(version) || version < 0 || version > steps.length)
      throw new Error(
        "Unsupported database schema version; use a compatible application.",
      );
    if (hasSettings && !raw)
      throw new Error(
        "Database has no schema version; manual recovery required.",
      );
    if (
      !hasSettings &&
      db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
        )
        .get()
    )
      throw new Error(
        "Unrecognized database; refusing to overwrite existing tables.",
      );
    const hasLedger = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
      )
      .get();
    if (version >= 2 && !hasLedger)
      throw new Error("Missing migration ledger.");
    if (hasLedger) {
      const rows = db
        .prepare("SELECT * FROM schema_migrations ORDER BY version")
        .all();
      if (
        rows.length !== version ||
        rows.some(
          (r, i) =>
            r.version !== i + 1 ||
            r.checksum !== digest(steps[i].sql) ||
            r.name !== steps[i].name,
        )
      )
        throw new Error("Migration history does not match this application.");
    }
    for (const step of steps.slice(version)) {
      db.exec(step.sql);
      db.prepare(
        "INSERT INTO settings(key,value) VALUES('schema_version',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run(JSON.stringify(step.version));
    }
    if (steps.length >= 2) {
      const insert = db.prepare(
        "INSERT OR IGNORE INTO schema_migrations VALUES(?,?,?,?)",
      );
      for (const step of steps)
        insert.run(
          step.version,
          step.name,
          digest(step.sql),
          new Date().toISOString(),
        );
    }
    db.exec("COMMIT");
    return steps.length;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
