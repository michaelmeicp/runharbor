import test from "node:test";
import assert from "node:assert/strict";
import { publicationFindings } from "../scripts/check-publication.js";

test("publication rejects runtime data and private source files even if force-added", () => {
  for (const path of [
    ".env",
    ".env.local",
    "data/session.db-wal",
    "notes/raw.log",
    "auth.json",
    ".codex/config.toml",
    "attachments/1-requirements_final.md",
  ]) {
    assert.deepEqual(publicationFindings(path, Buffer.from("")), [
      "private or runtime file",
    ]);
  }
});

test("publication detects home paths without returning sensitive values", () => {
  for (const prefix of ["/Users/", "/home/", "C:\\Users\\"]) {
    const separator = prefix.startsWith("C:") ? "\\" : "/";
    const result = publicationFindings(
      "docs/example.md",
      Buffer.from(prefix + "example-user" + separator + "project"),
    );
    assert.deepEqual(result, ["personal home path"]);
  }
  assert.deepEqual(
    publicationFindings(
      "docs/example.md",
      Buffer.from("/tmp/" + "codex-remote-attachments/id/file"),
    ),
    ["private attachment path"],
  );
});

test("publication permits synthetic relative fixtures and binary screenshots", () => {
  assert.deepEqual(
    publicationFindings(
      "fixtures/m0/test.json",
      Buffer.from('{"target":".codex/auth.json","allowed":false}'),
    ),
    [],
  );
  assert.deepEqual(
    publicationFindings(
      "docs/setup.md",
      Buffer.from(
        "Use ~/.runharbor and /tmp/runharbor-test; never publish credentials.",
      ),
    ),
    [],
  );
  assert.deepEqual(
    publicationFindings(
      "docs/images/demo.png",
      Buffer.from([137, 80, 78, 71, 0]),
    ),
    [],
  );
});
