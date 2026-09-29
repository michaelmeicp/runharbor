import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { migrations, migrate } from "../src/migrations.js";
const using = (fn) => {
  const db = new DatabaseSync(":memory:");
  try {
    fn(db);
  } finally {
    db.close();
  }
};
test("fresh database and repeated startup keep a verified migration ledger", () =>
  using((db) => {
    assert.equal(migrate(db), 2);
    migrate(db);
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM schema_migrations").get().n,
      2,
    );
  }));
test("legacy v1 upgrade preserves records and password settings", () =>
  using((db) => {
    db.exec(migrations[0].sql);
    db.prepare("INSERT INTO settings VALUES(?,?)").run("schema_version", "1");
    db.prepare("INSERT INTO settings VALUES(?,?)").run(
      "password",
      '"existing-hash"',
    );
    db.prepare("INSERT INTO entities VALUES(?,?,?,?,?,?)").run(
      "projects",
      "p",
      null,
      "a",
      "a",
      '{"name":"Keep"}',
    );
    migrate(db);
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='password'").get().value,
      '"existing-hash"',
    );
    assert.equal(
      JSON.parse(db.prepare("SELECT body FROM entities").get().body).name,
      "Keep",
    );
  }));
test("failed DDL rolls back both schema and version", () =>
  using((db) => {
    migrate(db);
    assert.throws(() =>
      migrate(db, [
        ...migrations,
        {
          version: 3,
          name: "bad",
          sql: "CREATE TABLE accidental(x); SELECT * FROM missing;",
        },
      ]),
    );
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='schema_version'").get()
        .value,
      "2",
    );
    assert.equal(
      db
        .prepare("SELECT name FROM sqlite_master WHERE name='accidental'")
        .get(),
      undefined,
    );
  }));
test("future and tampered migrations fail closed", () =>
  using((db) => {
    migrate(db);
    db.exec("UPDATE settings SET value='99' WHERE key='schema_version'");
    assert.throws(() => migrate(db), /Unsupported/);
    assert.equal(
      db.prepare("SELECT value FROM settings WHERE key='schema_version'").get()
        .value,
      "99",
    );
    db.exec(
      "UPDATE settings SET value='2' WHERE key='schema_version'; UPDATE schema_migrations SET checksum='changed' WHERE version=1",
    );
    assert.throws(() => migrate(db), /history/);
  }));
