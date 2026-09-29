import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { publicationFindings } from "./check-publication.js";

const source = fileURLToPath(new URL("../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "runharbor-package-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
let app;
try {
  const [packed] = JSON.parse(
    execFileSync(
      npm,
      ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
      { cwd: source, encoding: "utf8", timeout: 60000 },
    ),
  );
  const files = new Set(packed.files.map((f) => f.path));
  for (const required of [
    "LICENSE",
    "NOTICE",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "README.md",
    "README.zh-Hant.md",
    "src/migrations.js",
    "web/index.html",
    "packages/adapter-sdk/output.schema.json",
  ]) {
    assert(files.has(required), `Release package is missing ${required}`);
  }
  // Scan the package inventory, including files that git ls-files would miss.
  for (const file of files) {
    assert.deepEqual(
      publicationFindings(file, readFileSync(resolve(source, file))),
      [],
      "Release package contains a private path or runtime file",
    );
  }
  const install = join(root, "install");
  mkdirSync(install);
  writeFileSync(join(install, "package.json"), '{"private":true}');
  execFileSync(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--omit=dev",
      "--no-audit",
      "--no-fund",
      join(root, packed.filename),
    ],
    { cwd: install, stdio: "pipe", timeout: 120000 },
  );
  const installed = join(install, "node_modules", packed.name);
  const { createApp } = await import(
    pathToFileURL(join(installed, "src/server.js"))
  );
  app = await createApp({
    dataDir: join(root, "data"),
    port: 0,
    startEngine: false,
    mockDelay: 1,
    log: () => {},
  });
  assert.equal(await (await fetch(app.origin + "/healthz")).text(), "ok");
  for (const path of ["/", "/app.js", "/styles.css", "/logo.svg"]) {
    const response = await fetch(app.origin + path);
    assert.equal(response.status, 200, `Installed asset unavailable: ${path}`);
    assert((await response.text()).length > 0);
  }
  assert.equal((await fetch(app.origin + "/api/state")).status, 401);
  const headers = { "Content-Type": "application/json", Origin: app.origin };
  const setup = await fetch(app.origin + "/auth/setup", {
    method: "POST",
    headers,
    body: JSON.stringify({
      setup_token: app.setupToken,
      password: "package smoke test password",
    }),
  });
  assert.equal(setup.status, 200);
  const { csrf } = await setup.json();
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const demo = await fetch(app.origin + "/api/demo", {
    method: "POST",
    headers: { ...headers, Cookie: cookie, "X-CSRF-Token": csrf },
    body: "{}",
  });
  assert.equal(demo.status, 201);
  await demo.json();
  await app.engine.tick();
  await Promise.all([...app.engine.work]);
  assert(app.store.all("runs").some((run) => run.status === "succeeded"));
  assert(app.store.all("artifacts").length > 0);
  assert.equal(
    (await fetch(app.origin + "/api/state", { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  assert.equal(app.store.setting("schema_version"), 2);
  const help = execFileSync(
    process.execPath,
    [join(installed, "src/cli.js"), "--help"],
    { encoding: "utf8", timeout: 10000 },
  );
  assert(help.includes("RunHarbor"));
  console.log(
    "Package passed: inventory/privacy, clean production install, web assets, authentication, demo output, migrations and CLI.",
  );
} finally {
  if (app) await app.close();
  rmSync(root, { recursive: true, force: true });
}
