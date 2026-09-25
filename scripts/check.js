import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)],
  );
}
for (const path of ["src", "web", "tests", "scripts"]
  .flatMap(files)
  .filter((p) => p.endsWith(".js"))) {
  const r = spawnSync(process.execPath, ["--check", path], {
    encoding: "utf8",
  });
  if (r.status) {
    console.error(r.stderr);
    process.exit(1);
  }
}
const browser = readFileSync("web/app.js", "utf8");
assert(
  !/\.innerHTML\s*=|insertAdjacentHTML|eval\(/.test(browser),
  "Unsafe browser sink.",
);
const cli = readFileSync("src/cli.js", "utf8");
assert(/getuid\?\.\(\)\s*===\s*0/.test(cli), "Root guard missing.");
console.log(
  "Syntax checks, unsafe DOM sink check, and root guard check passed.",
);
